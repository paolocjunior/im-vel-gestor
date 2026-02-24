import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Sanitization (Section 9) ──
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeHeader(s: string): string {
  return (s || "").replace(/[\r\n]+/g, " ").trim();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidUUID(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

function normalizeResendError(status: number): string {
  if (status === 400) return "RESEND_400";
  if (status === 401) return "RESEND_401";
  if (status === 429) return "RESEND_429";
  if (status >= 500) return "RESEND_500";
  return "RESEND_" + status;
}

// ── HTML Template (fixed, server-side only) ──
function buildEmailHtml(params: {
  senderName: string;
  quotationNumber: string;
  message: string;
  items: Array<{ code: string; name: string; unit: string; quantity: number; observation: string | null }>;
}): string {
  const { senderName, quotationNumber, message, items } = params;
  const safeMessage = escapeHtml(message).replace(/\r\n|\r|\n/g, "<br/>");
  const safeSender = escapeHtml(senderName);

  const rows = items
    .map(
      (item, idx) => `
    <tr style="border-bottom:1px solid #e5e7eb;">
      <td style="padding:8px;text-align:center;font-size:13px;">${idx + 1}</td>
      <td style="padding:8px;font-size:13px;font-family:monospace;">${escapeHtml(item.code)}</td>
      <td style="padding:8px;font-size:13px;">${escapeHtml(item.name)}</td>
      <td style="padding:8px;text-align:center;font-size:13px;">${escapeHtml(item.unit)}</td>
      <td style="padding:8px;text-align:right;font-size:13px;">${item.quantity}</td>
      <td style="padding:8px;font-size:13px;">${item.observation ? escapeHtml(item.observation) : "—"}</td>
    </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#f9fafb;">
  <div style="max-width:680px;margin:0 auto;padding:24px;">
    <div style="background:#fff;border-radius:8px;border:1px solid #e5e7eb;padding:24px;">
      <h2 style="margin:0 0 4px;font-size:18px;color:#111;">Solicitação de Cotação #${escapeHtml(quotationNumber)}</h2>
      <p style="margin:0 0 16px;font-size:13px;color:#6b7280;">Enviado por ${safeSender}</p>
      
      <div style="margin:0 0 20px;font-size:14px;color:#374151;line-height:1.6;">
        ${safeMessage}
      </div>

      <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
        <thead>
          <tr style="background:#f3f4f6;">
            <th style="padding:8px;font-size:12px;text-align:center;color:#374151;">#</th>
            <th style="padding:8px;font-size:12px;text-align:left;color:#374151;">Código</th>
            <th style="padding:8px;font-size:12px;text-align:left;color:#374151;">Descrição</th>
            <th style="padding:8px;font-size:12px;text-align:center;color:#374151;">Un</th>
            <th style="padding:8px;font-size:12px;text-align:right;color:#374151;">Qtde</th>
            <th style="padding:8px;font-size:12px;text-align:left;color:#374151;">Obs</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      <p style="margin:20px 0 0;font-size:12px;color:#9ca3af;">
        Este e-mail foi gerado automaticamente. Por favor, responda com sua proposta.
      </p>
    </div>
  </div>
</body>
</html>`;
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Only POST
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "METHOD_NOT_ALLOWED" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // ── Step 1-2: Validate auth ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "UNAUTHORIZED" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY")!;

    // Admin client (service role)
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ── Step 3: auth.getUser for online validation ──
    const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "UNAUTHORIZED" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = user.id;

    // ── Step 4: Validate body ──
    let body: { request_id?: string };
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "INVALID_BODY" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const requestId = body?.request_id;
    if (!requestId || !isValidUUID(requestId)) {
      return new Response(JSON.stringify({ error: "INVALID_REQUEST_ID" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Step 5: RLS load with user token ──
    const anonKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: rlsCheck } = await userClient
      .from("quotation_requests")
      .select("id, status, provider_message_id")
      .eq("id", requestId)
      .single();

    // ── Step 6: Not found ──
    if (!rlsCheck) {
      return new Response(JSON.stringify({ error: "NOT_FOUND" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Step 7: Already sent ──
    if (rlsCheck.status === "sent") {
      return new Response(
        JSON.stringify({ ok: true, alreadySent: true, messageId: rlsCheck.provider_message_id }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Step 8: Call reserve RPC ──
    const { data: reserveResult, error: reserveError } = await adminClient.rpc(
      "reserve_quotation_email_send",
      { p_request_id: requestId, p_user_id: userId }
    );

    if (reserveError) {
      console.error("reserve RPC error:", reserveError.message);
      return new Response(JSON.stringify({ error: "INTERNAL" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const reserve = reserveResult as {
      ok: boolean;
      code: string;
      study_id?: string;
      vendor_id?: string;
      send_key?: string;
      attempt_count?: number;
      provider_message_id?: string;
    };

    // ── Step 9: Map reserve result ──
    if (reserve.code === "ALREADY_SENT") {
      return new Response(
        JSON.stringify({ ok: true, alreadySent: true, messageId: reserve.provider_message_id }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (reserve.code === "NOT_FOUND") {
      return new Response(JSON.stringify({ error: "NOT_FOUND" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (reserve.code === "RATE_LIMIT") {
      return new Response(JSON.stringify({ error: "RATE_LIMIT" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (["CONFLICT", "MAX_ATTEMPTS", "COOLDOWN"].includes(reserve.code)) {
      return new Response(JSON.stringify({ error: "CONFLICT", detail: reserve.code }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (reserve.code !== "OK") {
      return new Response(JSON.stringify({ error: "INTERNAL" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const studyId = reserve.study_id!;
    const vendorId = reserve.vendor_id;
    const sendKey = reserve.send_key!;

    // ── Step 10: Fetch canonical data from DB via admin ──
    const [requestData, vendorData, itemsData, profileData, studyData] = await Promise.all([
      adminClient
        .from("quotation_requests")
        .select("quotation_number, message")
        .eq("id", requestId)
        .single(),
      vendorId
        ? adminClient
            .from("study_vendors")
            .select("email, nome_fantasia, razao_social")
            .eq("id", vendorId)
            .single()
        : Promise.resolve({ data: null, error: null }),
      adminClient
        .from("quotation_request_items")
        .select("stage_id, observation, position, construction_stages(code, name, quantity, unit_id, construction_units(abbreviation))")
        .eq("request_id", requestId)
        .order("position"),
      adminClient
        .from("profiles")
        .select("full_name, email")
        .eq("user_id", userId)
        .single(),
      adminClient
        .from("studies")
        .select("name")
        .eq("id", studyId)
        .single(),
    ]);

    // ── Step 11: Validate vendor email ──
    const vendorEmail = vendorData?.data?.email;
    if (!vendorEmail || !isValidEmail(vendorEmail)) {
      // Finalize as failed
      await adminClient.rpc("finalize_quotation_email_send", {
        p_request_id: requestId,
        p_user_id: userId,
        p_outcome: "failed",
        p_error_code: "VENDOR_NO_EMAIL",
      });
      return new Response(JSON.stringify({ error: "VENDOR_NO_EMAIL" }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Step 12-13: Build email HTML ──
    const senderName = profileData?.data?.full_name || "Usuário";
    const replyTo = profileData?.data?.email;
    const quotationNumber = String(requestData?.data?.quotation_number || 1).padStart(3, "0");
    const messageText = requestData?.data?.message || "";

    const emailItems = (itemsData?.data || []).map((item: any) => {
      const stage = item.construction_stages;
      return {
        code: stage?.code || "",
        name: stage?.name || "",
        unit: stage?.construction_units?.abbreviation || "",
        quantity: stage?.quantity || 0,
        observation: item.observation,
      };
    });

    const html = buildEmailHtml({
      senderName,
      quotationNumber,
      message: messageText,
      items: emailItems,
    });

    // ── Step 14: Sanitize headers ──
    const studyName = studyData?.data?.name || "";
    const subject = sanitizeHeader(
      `Solicitação de Cotação #${quotationNumber}${studyName ? ` - ${escapeHtml(studyName)}` : ""}`
    );

    const vendorName = vendorData?.data?.nome_fantasia || vendorData?.data?.razao_social || "";

    // ── Step 15: Send via Resend with timeout and Idempotency-Key ──
    const resendHeaders: Record<string, string> = {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": sendKey,
    };

    const resendBody: Record<string, any> = {
      from: "Cotações <cotacoes@seudominio.com.br>",
      to: [vendorEmail],
      subject,
      html,
    };

    // Only add reply_to if valid
    if (replyTo && isValidEmail(replyTo)) {
      resendBody.reply_to = replyTo;
    }

    const sendStart = Date.now();
    let resendResponse: Response;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout
      resendResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: resendHeaders,
        body: JSON.stringify(resendBody),
        signal: controller.signal,
      });
      clearTimeout(timeout);
    } catch (err: any) {
      const latency = Date.now() - sendStart;
      const errorCode = err.name === "AbortError" ? "RESEND_TIMEOUT" : "RESEND_NETWORK";
      await adminClient.rpc("finalize_quotation_email_send", {
        p_request_id: requestId,
        p_user_id: userId,
        p_outcome: "failed",
        p_error_code: errorCode,
        p_provider_latency_ms: latency,
        p_message_len: html.length,
      });
      return new Response(JSON.stringify({ error: "INTERNAL" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const latency = Date.now() - sendStart;
    const resendStatus = resendResponse.status;

    // ── Step 16-17: Finalize based on Resend response ──
    if (resendResponse.ok) {
      const resendData = await resendResponse.json();
      const providerMessageId = resendData?.id || null;

      const finalizeResult = await adminClient.rpc("finalize_quotation_email_send", {
        p_request_id: requestId,
        p_user_id: userId,
        p_outcome: "sent",
        p_provider_message_id: providerMessageId,
        p_provider_http_status: resendStatus,
        p_provider_latency_ms: latency,
        p_message_len: html.length,
      });

      const finalize = finalizeResult.data as { ok: boolean; code: string } | null;

      // ── Step 18: Handle CONFLICT_FINALIZE ──
      if (finalize && !finalize.ok && finalize.code === "CONFLICT_FINALIZE") {
        // Re-check if already sent
        const { data: recheck } = await adminClient
          .from("quotation_requests")
          .select("status, provider_message_id")
          .eq("id", requestId)
          .single();

        if (recheck?.status === "sent") {
          return new Response(
            JSON.stringify({ ok: true, alreadySent: true, messageId: recheck.provider_message_id }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        console.error("CONFLICT_FINALIZE: unexpected state after sent", recheck);
        return new Response(JSON.stringify({ error: "INTERNAL" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({ ok: true, messageId: providerMessageId }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      // Failed
      const errorCode = normalizeResendError(resendStatus);
      // Consume body
      await resendResponse.text();

      await adminClient.rpc("finalize_quotation_email_send", {
        p_request_id: requestId,
        p_user_id: userId,
        p_outcome: "failed",
        p_error_code: errorCode,
        p_provider_http_status: resendStatus,
        p_provider_latency_ms: latency,
        p_message_len: html.length,
      });

      // RESEND_429 maps to HTTP 429
      if (resendStatus === 429) {
        return new Response(JSON.stringify({ error: "RATE_LIMIT" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: "INTERNAL" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (err) {
    console.error("Unhandled error in send-quotation-email:", err);
    return new Response(JSON.stringify({ error: "INTERNAL" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
