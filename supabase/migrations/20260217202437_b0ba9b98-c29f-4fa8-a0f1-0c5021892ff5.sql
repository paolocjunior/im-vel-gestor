
-- ============================================
-- CONSTRUCTION MODULE TABLES
-- ============================================

-- 1. Units of measurement
CREATE TABLE public.construction_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  name TEXT NOT NULL,
  abbreviation VARCHAR(10) NOT NULL,
  has_decimals BOOLEAN NOT NULL DEFAULT false,
  is_system BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.construction_units ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View system and own units" ON public.construction_units
  FOR SELECT USING (user_id IS NULL OR auth.uid() = user_id);
CREATE POLICY "Insert own units" ON public.construction_units
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Update own units" ON public.construction_units
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Delete own units" ON public.construction_units
  FOR DELETE USING (auth.uid() = user_id AND is_system = false);

-- 2. Stage catalog (EAP templates)
CREATE TABLE public.construction_stage_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  parent_id UUID REFERENCES public.construction_stage_catalog(id) ON DELETE CASCADE,
  code VARCHAR(20) NOT NULL,
  name TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  is_system BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.construction_stage_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View system and own catalog" ON public.construction_stage_catalog
  FOR SELECT USING (user_id IS NULL OR auth.uid() = user_id);
CREATE POLICY "Insert own catalog" ON public.construction_stage_catalog
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Update own catalog" ON public.construction_stage_catalog
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Delete own catalog" ON public.construction_stage_catalog
  FOR DELETE USING (auth.uid() = user_id AND is_system = false);

-- 3. Construction stages (actual stages for a study)
CREATE TABLE public.construction_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id UUID NOT NULL REFERENCES public.studies(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.construction_stages(id) ON DELETE CASCADE,
  catalog_id UUID REFERENCES public.construction_stage_catalog(id),
  code VARCHAR(20) NOT NULL,
  name TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  unit_id UUID REFERENCES public.construction_units(id),
  quantity NUMERIC NOT NULL DEFAULT 0,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  total_value NUMERIC NOT NULL DEFAULT 0,
  start_date DATE,
  end_date DATE,
  area_m2 NUMERIC NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.construction_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View own stages" ON public.construction_stages
  FOR SELECT USING (public.owns_study(study_id));
CREATE POLICY "Insert own stages" ON public.construction_stages
  FOR INSERT WITH CHECK (public.owns_study(study_id));
CREATE POLICY "Update own stages" ON public.construction_stages
  FOR UPDATE USING (public.owns_study(study_id));
CREATE POLICY "Delete own stages" ON public.construction_stages
  FOR DELETE USING (public.owns_study(study_id));

-- Triggers
CREATE TRIGGER update_construction_units_updated_at
  BEFORE UPDATE ON public.construction_units
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_construction_stage_catalog_updated_at
  BEFORE UPDATE ON public.construction_stage_catalog
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_construction_stages_updated_at
  BEFORE UPDATE ON public.construction_stages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- SEED: Units
-- ============================================
INSERT INTO public.construction_units (user_id, name, abbreviation, has_decimals, is_system) VALUES
  (NULL, 'Unidade', 'un.', false, true),
  (NULL, 'Metro', 'm', true, true),
  (NULL, 'Metro Quadrado', 'm²', true, true),
  (NULL, 'Metro Cúbico', 'm³', true, true),
  (NULL, 'Quilograma', 'kg', true, true),
  (NULL, 'Litro', 'l', true, true),
  (NULL, 'Verba', 'vb', false, true),
  (NULL, 'Conjunto', 'cj', false, true),
  (NULL, 'Peça', 'pç', false, true),
  (NULL, 'Saco', 'sc', false, true),
  (NULL, 'Hora', 'h', true, true),
  (NULL, 'Dia', 'dia', false, true),
  (NULL, 'Mês', 'mês', false, true);

-- ============================================
-- SEED: EAP Catalog (full)
-- ============================================
DO $$
DECLARE
  s1 UUID; s1_1 UUID; s1_2 UUID; s1_3 UUID; s1_4 UUID;
  s2 UUID; s2_1 UUID; s2_2 UUID;
  s3 UUID; s3_1 UUID; s3_2 UUID; s3_3 UUID;
  s4 UUID; s4_1 UUID; s4_2 UUID; s4_3 UUID;
  s5 UUID; s5_1 UUID; s5_2 UUID;
  s6 UUID; s6_1 UUID; s6_2 UUID; s6_3 UUID; s6_4 UUID;
  s7 UUID; s7_1 UUID; s7_2 UUID;
  s8 UUID; s8_1 UUID; s8_2 UUID; s8_3 UUID; s8_4 UUID;
  s9 UUID; s9_1 UUID; s9_2 UUID;
  s10 UUID; s10_1 UUID; s10_2 UUID;
  s11 UUID; s11_1 UUID; s11_2 UUID;
BEGIN
  -- === 1.0 Gestão, Planejamento e Legalização ===
  INSERT INTO public.construction_stage_catalog (user_id, parent_id, code, name, level, position, is_system)
  VALUES (NULL, NULL, '1.0', 'Gestão, Planejamento e Legalização (Pré-Obra)', 0, 1, true) RETURNING id INTO s1;

  INSERT INTO public.construction_stage_catalog (user_id, parent_id, code, name, level, position, is_system)
  VALUES (NULL, s1, '1.1', 'Estudos e Levantamentos', 1, 1, true) RETURNING id INTO s1_1;
  INSERT INTO public.construction_stage_catalog (user_id, parent_id, code, name, level, position, is_system) VALUES
    (NULL, s1_1, '1.1.1', 'Levantamento Topográfico (Altimetria e Planimetria)', 2, 1, true),
    (NULL, s1_1, '1.1.2', 'Sondagem do Solo (SPT - Investigação Geotécnica)', 2, 2, true),
    (NULL, s1_1, '1.1.3', 'Estudo de Viabilidade Econômica e Orçamento Estimativo', 2, 3, true);

  INSERT INTO public.construction_stage_catalog (user_id, parent_id, code, name, level, position, is_system)
  VALUES (NULL, s1, '1.2', 'Projetos Técnicos', 1, 2, true) RETURNING id INTO s1_2;
  INSERT INTO public.construction_stage_catalog (user_id, parent_id, code, name, level, position, is_system) VALUES
    (NULL, s1_2, '1.2.1', 'Arquitetônico (Plantas, Cortes, Fachadas)', 2, 1, true),
    (NULL, s1_2, '1.2.2', 'Estrutural (Fundação e Superestrutura)', 2, 2, true),
    (NULL, s1_2, '1.2.3', 'Instalações (Elétrico, Hidrossanitário, Lógica, Gás, SPDA)', 2, 3, true),
    (NULL, s1_2, '1.2.4', 'Compatibilização de Projetos (BIM / Clash Detection)', 2, 4, true);

  INSERT INTO public.construction_stage_catalog (user_id, parent_id, code, name, level, position, is_system)
  VALUES (NULL, s1, '1.3', 'Legalização e Licenciamento', 1, 3, true) RETURNING id INTO s1_3;
  INSERT INTO public.construction_stage_catalog (user_id, parent_id, code, name, level, position, is_system) VALUES
    (NULL, s1_3, '1.3.1', 'Aprovação na Prefeitura (Alvará de Construção)', 2, 1, true),
    (NULL, s1_3, '1.3.2', 'Aprovações em Concessionárias (Água/Luz) e Bombeiros', 2, 2, true),
    (NULL, s1_3, '1.3.3', 'Cadastro da Obra no INSS (CNO) e Taxas (ART/RRT)', 2, 3, true),
    (NULL, s1_3, '1.3.4', 'Matrícula e Registros em Cartório', 2, 4, true);

  INSERT INTO public.construction_stage_catalog (user_id, parent_id, code, name, level, position, is_system)
  VALUES (NULL, s1, '1.4', 'Planejamento e Controle (Gestão)', 1, 4, true) RETURNING id INTO s1_4;
  INSERT INTO public.construction_stage_catalog (user_id, parent_id, code, name, level, position, is_system) VALUES
    (NULL, s1_4, '1.4.1', 'Definição do Cronograma Físico-Financeiro e Linha de Base', 2, 1, true),
    (NULL, s1_4, '1.4.2', 'Definição da Curva S (Fluxo de Caixa)', 2, 2, true),
    (NULL, s1_4, '1.4.3', 'Elaboração do Plano de Qualidade e Diário de Obra', 2, 3, true);

  -- === 2.0 Serviços Preliminares e Canteiro ===
  INSERT INTO public.construction_stage_catalog (user_id, parent_id, code, name, level, position, is_system)
  VALUES (NULL, NULL, '2.0', 'Serviços Preliminares e Canteiro', 0, 2, true) RETURNING id INTO s2;

  INSERT INTO public.construction_stage_catalog (user_id, parent_id, code, name, level, position, is_system)
  VALUES (NULL, s2, '2.1', 'Preparação do Terreno', 1, 1, true) RETURNING id INTO s2_1;
  INSERT INTO public.construction_stage_catalog (user_id, parent_id, code, name, level, position, is_system) VALUES
    (NULL, s2_1, '2.1.1', 'Limpeza do Terreno (Roçada/Destoca)', 2, 1, true),
    (NULL, s2_1, '2.1.2', 'Demolições e retiradas de estruturas existentes', 2, 2, true),
    (NULL, s2_1, '2.1.3', 'Terraplanagem (Corte, Aterro, Nivelamento e Compactação)', 2, 3, true);

  INSERT INTO public.construction_stage_catalog (user_id, parent_id, code, name, level, position, is_system)
  VALUES (NULL, s2, '2.2', 'Instalação do Canteiro e Logística', 1, 2, true) RETURNING id INTO s2_2;
  INSERT INTO public.construction_stage_catalog (user_id, parent_id, code, name, level, position, is_system) VALUES
    (NULL, s2_2, '2.2.1', 'Fechamento do Perímetro (Tapumes) e Placas de Obra', 2, 1, true),
    (NULL, s2_2, '2.2.2', 'Barracão, Escritório e Sanitários Provisórios', 2, 2, true),
    (NULL, s2_2, '2.2.3', 'Instalações Provisórias (Água e Energia de obra)', 2, 3, true),
    (NULL, s2_2, '2.2.4', 'Locação da Obra (Gabarito, Eixos e Marcações)', 2, 4, true),
    (NULL, s2_2, '2.2.5', 'Gestão de Resíduos (Baias, Caçambas e Segregação)', 2, 5, true),
    (NULL, s2_2, '2.2.6', 'Segurança do Trabalho (EPCs, Extintores, Sinalização)', 2, 6, true);

  -- === 3.0 Infraestrutura (Fundação) ===
  INSERT INTO public.construction_stage_catalog (user_id, parent_id, code, name, level, position, is_system)
  VALUES (NULL, NULL, '3.0', 'Infraestrutura (Fundação)', 0, 3, true) RETURNING id INTO s3;

  INSERT INTO public.construction_stage_catalog (user_id, parent_id, code, name, level, position, is_system)
  VALUES (NULL, s3, '3.1', 'Escavações e Movimentação', 1, 1, true) RETURNING id INTO s3_1;
  INSERT INTO public.construction_stage_catalog (user_id, parent_id, code, name, level, position, is_system) VALUES
    (NULL, s3_1, '3.1.1', 'Escavação de Valas, Blocos e Sapatas', 2, 1, true),
    (NULL, s3_1, '3.1.2', 'Escavação de Estacas (Brocas/Hélice/Pré-moldada)', 2, 2, true),
    (NULL, s3_1, '3.1.3', 'Contenções e Drenagem Provisória', 2, 3, true);

  INSERT INTO public.construction_stage_catalog (user_id, parent_id, code, name, level, position, is_system)
  VALUES (NULL, s3, '3.2', 'Execução da Fundação', 1, 2, true) RETURNING id INTO s3_2;
  INSERT INTO public.construction_stage_catalog (user_id, parent_id, code, name, level, position, is_system) VALUES
    (NULL, s3_2, '3.2.1', 'Execução de Estacas (Armação e Concretagem)', 2, 1, true),
    (NULL, s3_2, '3.2.2', 'Blocos de Coroamento e Vigas Baldrames', 2, 2, true),
    (NULL, s3_2, '3.2.3', 'Laje de Piso (Radier) ou Contrapiso armado', 2, 3, true),
    (NULL, s3_2, '3.2.4', 'Aterramento Básico (Cordoalha em fundação)', 2, 4, true);

  INSERT INTO public.construction_stage_catalog (user_id, parent_id, code, name, level, position, is_system)
  VALUES (NULL, s3, '3.3', 'Impermeabilização de Infraestrutura', 1, 3, true) RETURNING id INTO s3_3;
  INSERT INTO public.construction_stage_catalog (user_id, parent_id, code, name, level, position, is_system) VALUES
    (NULL, s3_3, '3.3.1', 'Aplicação de manta/emulsão em Baldrames', 2, 1, true),
    (NULL, s3_3, '3.3.2', 'Proteção Mecânica e Reaterro compactado', 2, 2, true);

  -- === 4.0 Superestrutura (Esqueleto) ===
  INSERT INTO public.construction_stage_catalog (user_id, parent_id, code, name, level, position, is_system)
  VALUES (NULL, NULL, '4.0', 'Superestrutura (Esqueleto)', 0, 4, true) RETURNING id INTO s4;

  INSERT INTO public.construction_stage_catalog (user_id, parent_id, code, name, level, position, is_system)
  VALUES (NULL, s4, '4.1', 'Elementos Verticais (Pilares/Paredes)', 1, 1, true) RETURNING id INTO s4_1;
  INSERT INTO public.construction_stage_catalog (user_id, parent_id, code, name, level, position, is_system) VALUES
    (NULL, s4_1, '4.1.1', 'Formas, Armação e Concretagem de Pilares', 2, 1, true),
    (NULL, s4_1, '4.1.2', 'Alvenaria Estrutural', 2, 2, true);

  INSERT INTO public.construction_stage_catalog (user_id, parent_id, code, name, level, position, is_system)
  VALUES (NULL, s4, '4.2', 'Elementos Horizontais (Vigas e Lajes)', 1, 2, true) RETURNING id INTO s4_2;
  INSERT INTO public.construction_stage_catalog (user_id, parent_id, code, name, level, position, is_system) VALUES
    (NULL, s4_2, '4.2.1', 'Formas e Escoramento de Vigas/Lajes', 2, 1, true),
    (NULL, s4_2, '4.2.2', 'Montagem de Laje (Pré-moldada, Maciça ou Steel Deck)', 2, 2, true),
    (NULL, s4_2, '4.2.3', 'Instalações Embutidas na Laje (Elétrica/Hidráulica)', 2, 3, true),
    (NULL, s4_2, '4.2.4', 'Concretagem e Cura', 2, 4, true);

  INSERT INTO public.construction_stage_catalog (user_id, parent_id, code, name, level, position, is_system)
  VALUES (NULL, s4, '4.3', 'Elementos Especiais e Controle', 1, 3, true) RETURNING id INTO s4_3;
  INSERT INTO public.construction_stage_catalog (user_id, parent_id, code, name, level, position, is_system) VALUES
    (NULL, s4_3, '4.3.1', 'Escadas e Reservatório Superior (Caixa d''água)', 2, 1, true),
    (NULL, s4_3, '4.3.2', 'Controle Tecnológico do Concreto (Slump test, Corpos de prova)', 2, 2, true);

  -- === 5.0 Vedações e Envoltória ===
  INSERT INTO public.construction_stage_catalog (user_id, parent_id, code, name, level, position, is_system)
  VALUES (NULL, NULL, '5.0', 'Vedações e Envoltória', 0, 5, true) RETURNING id INTO s5;

  INSERT INTO public.construction_stage_catalog (user_id, parent_id, code, name, level, position, is_system)
  VALUES (NULL, s5, '5.1', 'Alvenaria e Divisórias', 1, 1, true) RETURNING id INTO s5_1;
  INSERT INTO public.construction_stage_catalog (user_id, parent_id, code, name, level, position, is_system) VALUES
    (NULL, s5_1, '5.1.1', 'Elevação de Alvenaria (Tijolo/Bloco)', 2, 1, true),
    (NULL, s5_1, '5.1.2', 'Paredes de Drywall / Steel Frame', 2, 2, true),
    (NULL, s5_1, '5.1.3', 'Vergas, Contravergas e Encunhamento', 2, 3, true),
    (NULL, s5_1, '5.1.4', 'Fechamento de Shafts e Dutos', 2, 4, true);

  INSERT INTO public.construction_stage_catalog (user_id, parent_id, code, name, level, position, is_system)
  VALUES (NULL, s5, '5.2', 'Cobertura e Telhado', 1, 2, true) RETURNING id INTO s5_2;
  INSERT INTO public.construction_stage_catalog (user_id, parent_id, code, name, level, position, is_system) VALUES
    (NULL, s5_2, '5.2.1', 'Estrutura (Madeiramento ou Metálica)', 2, 1, true),
    (NULL, s5_2, '5.2.2', 'Telhamento (Cerâmica, Metálica, Shingle, etc.)', 2, 2, true),
    (NULL, s5_2, '5.2.3', 'Calhas, Rufos e Condutores de Água', 2, 3, true),
    (NULL, s5_2, '5.2.4', 'Isolamento Termoacústico de Cobertura', 2, 4, true);

  -- === 6.0 Instalações Prediais ===
  INSERT INTO public.construction_stage_catalog (user_id, parent_id, code, name, level, position, is_system)
  VALUES (NULL, NULL, '6.0', 'Instalações Prediais (Embutidas/Infra)', 0, 6, true) RETURNING id INTO s6;

  INSERT INTO public.construction_stage_catalog (user_id, parent_id, code, name, level, position, is_system)
  VALUES (NULL, s6, '6.1', 'Hidrossanitário', 1, 1, true) RETURNING id INTO s6_1;
  INSERT INTO public.construction_stage_catalog (user_id, parent_id, code, name, level, position, is_system) VALUES
    (NULL, s6_1, '6.1.1', 'Rasgos, Tubulações de Água Fria/Quente e Esgoto', 2, 1, true),
    (NULL, s6_1, '6.1.2', 'Caixas Sifonadas, Gordura e Passagem', 2, 2, true),
    (NULL, s6_1, '6.1.3', 'Testes de Estanqueidade e Pressurização', 2, 3, true);

  INSERT INTO public.construction_stage_catalog (user_id, parent_id, code, name, level, position, is_system)
  VALUES (NULL, s6, '6.2', 'Elétrica e Dados', 1, 2, true) RETURNING id INTO s6_2;
  INSERT INTO public.construction_stage_catalog (user_id, parent_id, code, name, level, position, is_system) VALUES
    (NULL, s6_2, '6.2.1', 'Eletrodutos, Caixinhas (4x2, 4x4) e Quadros de Distribuição', 2, 1, true),
    (NULL, s6_2, '6.2.2', 'Passagem de Cabos (Elétrica, TV, Internet)', 2, 2, true);

  INSERT INTO public.construction_stage_catalog (user_id, parent_id, code, name, level, position, is_system)
  VALUES (NULL, s6, '6.3', 'Climatização (HVAC)', 1, 3, true) RETURNING id INTO s6_3;
  INSERT INTO public.construction_stage_catalog (user_id, parent_id, code, name, level, position, is_system) VALUES
    (NULL, s6_3, '6.3.1', 'Infraestrutura de Ar-Condicionado (Drenos, Linha Frigorígena, Elétrica)', 2, 1, true);

  INSERT INTO public.construction_stage_catalog (user_id, parent_id, code, name, level, position, is_system)
  VALUES (NULL, s6, '6.4', 'Gás e SPDA', 1, 4, true) RETURNING id INTO s6_4;
  INSERT INTO public.construction_stage_catalog (user_id, parent_id, code, name, level, position, is_system) VALUES
    (NULL, s6_4, '6.4.1', 'Tubulação de Gás e Abrigo de Medidores', 2, 1, true),
    (NULL, s6_4, '6.4.2', 'SPDA (Para-raios) - Descidas e Malhas', 2, 2, true);

  -- === 7.0 Acabamentos Grossos ===
  INSERT INTO public.construction_stage_catalog (user_id, parent_id, code, name, level, position, is_system)
  VALUES (NULL, NULL, '7.0', 'Acabamentos Grossos', 0, 7, true) RETURNING id INTO s7;

  INSERT INTO public.construction_stage_catalog (user_id, parent_id, code, name, level, position, is_system)
  VALUES (NULL, s7, '7.1', 'Revestimentos de Parede (Base)', 1, 1, true) RETURNING id INTO s7_1;
  INSERT INTO public.construction_stage_catalog (user_id, parent_id, code, name, level, position, is_system) VALUES
    (NULL, s7_1, '7.1.1', 'Chapisco, Emboço e Reboco (Interno e Externo)', 2, 1, true),
    (NULL, s7_1, '7.1.2', 'Gesso Liso em Paredes', 2, 2, true);

  INSERT INTO public.construction_stage_catalog (user_id, parent_id, code, name, level, position, is_system)
  VALUES (NULL, s7, '7.2', 'Pisos (Base) e Impermeabilização', 1, 2, true) RETURNING id INTO s7_2;
  INSERT INTO public.construction_stage_catalog (user_id, parent_id, code, name, level, position, is_system) VALUES
    (NULL, s7_2, '7.2.1', 'Contrapiso e Regularização de base', 2, 1, true),
    (NULL, s7_2, '7.2.2', 'Impermeabilização de Áreas Molhadas', 2, 2, true),
    (NULL, s7_2, '7.2.3', 'Teste de Estanqueidade da Impermeabilização', 2, 3, true);

  -- === 8.0 Acabamentos Finos ===
  INSERT INTO public.construction_stage_catalog (user_id, parent_id, code, name, level, position, is_system)
  VALUES (NULL, NULL, '8.0', 'Acabamentos Finos', 0, 8, true) RETURNING id INTO s8;

  INSERT INTO public.construction_stage_catalog (user_id, parent_id, code, name, level, position, is_system)
  VALUES (NULL, s8, '8.1', 'Forros e Molduras', 1, 1, true) RETURNING id INTO s8_1;
  INSERT INTO public.construction_stage_catalog (user_id, parent_id, code, name, level, position, is_system) VALUES
    (NULL, s8_1, '8.1.1', 'Forro de Gesso (Tabicado/Liso) ou PVC', 2, 1, true),
    (NULL, s8_1, '8.1.2', 'Sancas e Cortineiros', 2, 2, true);

  INSERT INTO public.construction_stage_catalog (user_id, parent_id, code, name, level, position, is_system)
  VALUES (NULL, s8, '8.2', 'Revestimentos Cerâmicos e Pedras', 1, 2, true) RETURNING id INTO s8_2;
  INSERT INTO public.construction_stage_catalog (user_id, parent_id, code, name, level, position, is_system) VALUES
    (NULL, s8_2, '8.2.1', 'Assentamento de Piso e Azulejo (Porcelanatos)', 2, 1, true),
    (NULL, s8_2, '8.2.2', 'Rejuntamento e Limpeza pós-obra grossa', 2, 2, true),
    (NULL, s8_2, '8.2.3', 'Bancadas, Soleiras e Peitoris (Mármores/Granitos)', 2, 3, true);

  INSERT INTO public.construction_stage_catalog (user_id, parent_id, code, name, level, position, is_system)
  VALUES (NULL, s8, '8.3', 'Esquadrias e Vidros', 1, 3, true) RETURNING id INTO s8_3;
  INSERT INTO public.construction_stage_catalog (user_id, parent_id, code, name, level, position, is_system) VALUES
    (NULL, s8_3, '8.3.1', 'Portas, Batentes e Fechaduras (Internas/Externas)', 2, 1, true),
    (NULL, s8_3, '8.3.2', 'Janelas e Esquadrias (Alumínio/PVC)', 2, 2, true),
    (NULL, s8_3, '8.3.3', 'Vidros, Box de Banheiro e Espelhos', 2, 3, true);

  INSERT INTO public.construction_stage_catalog (user_id, parent_id, code, name, level, position, is_system)
  VALUES (NULL, s8, '8.4', 'Pintura e Textura', 1, 4, true) RETURNING id INTO s8_4;
  INSERT INTO public.construction_stage_catalog (user_id, parent_id, code, name, level, position, is_system) VALUES
    (NULL, s8_4, '8.4.1', 'Preparação (Lixa/Selador/Massa Corrida)', 2, 1, true),
    (NULL, s8_4, '8.4.2', 'Pintura Paredes e Tetos (Interna)', 2, 2, true),
    (NULL, s8_4, '8.4.3', 'Textura ou Pintura de Fachada (Externa)', 2, 3, true);

  -- === 9.0 Complementação e Equipamentos ===
  INSERT INTO public.construction_stage_catalog (user_id, parent_id, code, name, level, position, is_system)
  VALUES (NULL, NULL, '9.0', 'Complementação e Equipamentos', 0, 9, true) RETURNING id INTO s9;

  INSERT INTO public.construction_stage_catalog (user_id, parent_id, code, name, level, position, is_system)
  VALUES (NULL, s9, '9.1', 'Acabamentos Elétricos e Hidráulicos', 1, 1, true) RETURNING id INTO s9_1;
  INSERT INTO public.construction_stage_catalog (user_id, parent_id, code, name, level, position, is_system) VALUES
    (NULL, s9_1, '9.1.1', 'Instalação de Tomadas, Interruptores e Luminárias', 2, 1, true),
    (NULL, s9_1, '9.1.2', 'Louças (Vasos/Pias) e Metais (Torneiras/Chuveiros)', 2, 2, true),
    (NULL, s9_1, '9.1.3', 'Instalação de Evaporadoras de Ar-Condicionado e Aquecedores', 2, 3, true);

  INSERT INTO public.construction_stage_catalog (user_id, parent_id, code, name, level, position, is_system)
  VALUES (NULL, s9, '9.2', 'Marcenaria e Serralheria', 1, 2, true) RETURNING id INTO s9_2;
  INSERT INTO public.construction_stage_catalog (user_id, parent_id, code, name, level, position, is_system) VALUES
    (NULL, s9_2, '9.2.1', 'Armários Planejados (Cozinha/Quartos)', 2, 1, true),
    (NULL, s9_2, '9.2.2', 'Portões, Gradis e Corrimãos', 2, 2, true);

  -- === 10.0 Áreas Externas e Paisagismo ===
  INSERT INTO public.construction_stage_catalog (user_id, parent_id, code, name, level, position, is_system)
  VALUES (NULL, NULL, '10.0', 'Áreas Externas e Paisagismo', 0, 10, true) RETURNING id INTO s10;

  INSERT INTO public.construction_stage_catalog (user_id, parent_id, code, name, level, position, is_system)
  VALUES (NULL, s10, '10.1', 'Urbanização', 1, 1, true) RETURNING id INTO s10_1;
  INSERT INTO public.construction_stage_catalog (user_id, parent_id, code, name, level, position, is_system) VALUES
    (NULL, s10_1, '10.1.1', 'Calçadas, Passeios e Rampas de Acesso', 2, 1, true),
    (NULL, s10_1, '10.1.2', 'Muros de Divisa e Fechamentos Definitivos', 2, 2, true);

  INSERT INTO public.construction_stage_catalog (user_id, parent_id, code, name, level, position, is_system)
  VALUES (NULL, s10, '10.2', 'Jardinagem', 1, 2, true) RETURNING id INTO s10_2;
  INSERT INTO public.construction_stage_catalog (user_id, parent_id, code, name, level, position, is_system) VALUES
    (NULL, s10_2, '10.2.1', 'Preparação do Solo e Plantio (Grama/Jardim)', 2, 1, true),
    (NULL, s10_2, '10.2.2', 'Iluminação Externa e Irrigação', 2, 2, true);

  -- === 11.0 Entrega e Pós-Obra ===
  INSERT INTO public.construction_stage_catalog (user_id, parent_id, code, name, level, position, is_system)
  VALUES (NULL, NULL, '11.0', 'Entrega e Pós-Obra', 0, 11, true) RETURNING id INTO s11;

  INSERT INTO public.construction_stage_catalog (user_id, parent_id, code, name, level, position, is_system)
  VALUES (NULL, s11, '11.1', 'Finalização', 1, 1, true) RETURNING id INTO s11_1;
  INSERT INTO public.construction_stage_catalog (user_id, parent_id, code, name, level, position, is_system) VALUES
    (NULL, s11_1, '11.1.1', 'Limpeza Final (Fina)', 2, 1, true),
    (NULL, s11_1, '11.1.2', 'Testes Finais de Carga (Elétrica) e Vazão (Hidráulica)', 2, 2, true);

  INSERT INTO public.construction_stage_catalog (user_id, parent_id, code, name, level, position, is_system)
  VALUES (NULL, s11, '11.2', 'Documentação e Aceite', 1, 2, true) RETURNING id INTO s11_2;
  INSERT INTO public.construction_stage_catalog (user_id, parent_id, code, name, level, position, is_system) VALUES
    (NULL, s11_2, '11.2.1', 'Solicitação de Habite-se e Averbação (Cartório)', 2, 1, true),
    (NULL, s11_2, '11.2.2', 'Elaboração do As-Built (Como construído)', 2, 2, true),
    (NULL, s11_2, '11.2.3', 'Vistoria com Cliente e Resolução de Punch List', 2, 3, true),
    (NULL, s11_2, '11.2.4', 'Entrega das Chaves e Manual do Proprietário', 2, 4, true);
END $$;
