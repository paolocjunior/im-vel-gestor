export async function lookupCEP(cep: string): Promise<{
  ok: boolean;
  data?: { logradouro: string; bairro: string; localidade: string; uf: string };
  error?: string;
}> {
  const clean = cep.replace(/\D/g, "");
  if (clean.length !== 8) return { ok: false, error: "CEP inválido." };
  try {
    const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
    const data = await res.json();
    if (data.erro) return { ok: false, error: "CEP não encontrado." };
    return {
      ok: true,
      data: {
        logradouro: data.logradouro || "",
        bairro: data.bairro || "",
        localidade: data.localidade || "",
        uf: data.uf || "",
      },
    };
  } catch {
    return { ok: false, error: "Erro ao consultar CEP." };
  }
}
