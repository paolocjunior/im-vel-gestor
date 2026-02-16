/**
 * IDOR/BOLA Test Script — Anti-Horizontal Privilege Escalation
 * 
 * PRÉ-REQUISITOS:
 * 1. Dois usuários cadastrados no app (User A e User B)
 * 2. User A possui pelo menos 1 Study com dados (inputs, line_items, etc.)
 * 3. Copie o study_id de User A (via DevTools > Network ou pelo DB)
 * 4. Execute este script logado como User B no console do browser
 * 
 * COMO EXECUTAR:
 * 1. Faça login como User B no app
 * 2. Abra DevTools > Console
 * 3. Cole o conteúdo deste arquivo
 * 4. Chame: await runIDORTests("STUDY_ID_DO_USER_A")
 * 
 * CRITÉRIOS DE ACEITE:
 * - PASS: query retorna array vazio [], null, ou erro (42501/403)
 * - FAIL: query retorna dados do User A ou modifica dados do User A
 */

// Cole no console do browser (logado como User B):
// O supabase client já está disponível via window

async function runIDORTests(victimStudyId: string) {
  // @ts-ignore - supabase is available in the app context
  const { supabase } = await import('/src/integrations/supabase/client.ts');
  
  const results: { test: string; status: 'PASS' | 'FAIL'; detail: string }[] = [];

  // ========== TEST 1: SELECT study de outro usuário ==========
  try {
    const { data, error } = await supabase
      .from('studies')
      .select('*')
      .eq('id', victimStudyId)
      .single();
    
    if (error || !data) {
      results.push({ test: '1-SELECT-study', status: 'PASS', detail: `Bloqueado: ${error?.message || 'no data'}` });
    } else {
      results.push({ test: '1-SELECT-study', status: 'FAIL', detail: `DADOS VAZADOS: ${JSON.stringify(data).slice(0, 100)}` });
    }
  } catch (e: any) {
    results.push({ test: '1-SELECT-study', status: 'PASS', detail: `Exception: ${e.message}` });
  }

  // ========== TEST 2: INSERT referenciando study_id alheio ==========
  try {
    const { data, error } = await supabase
      .from('study_line_items')
      .insert({
        study_id: victimStudyId,
        description: 'IDOR-TEST-INJECTION',
        line_type: 'construction',
        amount: 99999,
      })
      .select();
    
    if (error) {
      results.push({ test: '2-INSERT-line_item', status: 'PASS', detail: `Bloqueado: ${error.message}` });
    } else {
      results.push({ test: '2-INSERT-line_item', status: 'FAIL', detail: `INSERIDO! id=${data?.[0]?.id}` });
      // Cleanup
      if (data?.[0]?.id) await supabase.from('study_line_items').delete().eq('id', data[0].id);
    }
  } catch (e: any) {
    results.push({ test: '2-INSERT-line_item', status: 'PASS', detail: `Exception: ${e.message}` });
  }

  // ========== TEST 3: UPDATE em study de outro usuário ==========
  try {
    const { data, error, count } = await supabase
      .from('studies')
      .update({ name: 'HACKED-BY-IDOR' })
      .eq('id', victimStudyId)
      .select();
    
    if (error) {
      results.push({ test: '3-UPDATE-study', status: 'PASS', detail: `Bloqueado: ${error.message}` });
    } else if (!data || data.length === 0) {
      results.push({ test: '3-UPDATE-study', status: 'PASS', detail: 'Nenhuma linha afetada (RLS bloqueou)' });
    } else {
      results.push({ test: '3-UPDATE-study', status: 'FAIL', detail: `MODIFICADO! ${JSON.stringify(data).slice(0, 100)}` });
    }
  } catch (e: any) {
    results.push({ test: '3-UPDATE-study', status: 'PASS', detail: `Exception: ${e.message}` });
  }

  // ========== TEST 4: DELETE (soft) em study de outro usuário via RPC ==========
  try {
    const { data, error } = await supabase.rpc('soft_delete_study', {
      p_study_id: victimStudyId,
    });
    
    if (error) {
      results.push({ test: '4-RPC-soft_delete', status: 'PASS', detail: `Bloqueado: ${error.message}` });
    } else {
      // Verificar se realmente deletou
      results.push({ test: '4-RPC-soft_delete', status: 'FAIL', detail: 'RPC executou sem erro - verificar se study foi deletado!' });
    }
  } catch (e: any) {
    results.push({ test: '4-RPC-soft_delete', status: 'PASS', detail: `Exception: ${e.message}` });
  }

  // ========== TEST 5: Download de documento de outro usuário ==========
  try {
    // Tentar listar documentos do study alheio
    const { data: docs, error: docErr } = await supabase
      .from('documents')
      .select('file_path')
      .eq('study_id', victimStudyId)
      .limit(1);
    
    if (docErr || !docs || docs.length === 0) {
      results.push({ test: '5-STORAGE-download', status: 'PASS', detail: `Listagem bloqueada: ${docErr?.message || 'sem resultados'}` });
    } else {
      // Se conseguiu listar, tenta baixar
      const { data: blob, error: dlErr } = await supabase.storage
        .from('documents')
        .download(docs[0].file_path);
      
      if (dlErr) {
        results.push({ test: '5-STORAGE-download', status: 'PASS', detail: `Download bloqueado: ${dlErr.message}` });
      } else {
        results.push({ test: '5-STORAGE-download', status: 'FAIL', detail: `ARQUIVO BAIXADO! size=${blob?.size}` });
      }
    }
  } catch (e: any) {
    results.push({ test: '5-STORAGE-download', status: 'PASS', detail: `Exception: ${e.message}` });
  }

  // ========== RELATÓRIO ==========
  console.log('\n========== IDOR TEST RESULTS ==========');
  const allPass = results.every(r => r.status === 'PASS');
  results.forEach(r => {
    const icon = r.status === 'PASS' ? '✅' : '❌';
    console.log(`${icon} [${r.status}] ${r.test}: ${r.detail}`);
  });
  console.log(`\n${allPass ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED — INVESTIGATE IMMEDIATELY'}`);
  console.log('========================================\n');
  
  return results;
}

// Para executar: await runIDORTests("uuid-do-study-do-user-a")
