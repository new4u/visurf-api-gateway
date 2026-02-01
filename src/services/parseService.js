/**
 * 语义解析服务 — 使用 Claude API 从文本提取知识图谱
 * 核心逻辑从 services/claudeService.ts + geminiService.ts 抽取
 */

const CLAUDE_API_BASE_URL = process.env.CLAUDE_API_BASE_URL || 'https://api.anthropic.com';
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-3-haiku-20240307';

/**
 * 生成知识提取的提示词
 */
function generatePrompt(text, language = 'both') {
  return `
Analyze the following text and extract a knowledge graph for a 'Real World Knowledge Map'.
You act as a Knowledge Extraction Engine.

Rules:
1. Identify key entities (concepts, people, organizations, events).
2. Identify relationships between them.
3. Normalize entity names.
4. IMPORTANT BILINGUAL OUTPUT: Provide BOTH Chinese and English for all text fields:
   - "nameZh": Chinese name
   - "nameEn": English name
   - "labelZh": Chinese relationship label
   - "labelEn": English relationship label
   - "description": Can be in either language

Required JSON Structure:
{
  "entities": [
    {
      "name": "Primary Name",
      "nameZh": "中文名称",
      "nameEn": "English Name",
      "type": "CONCEPT|PERSON|EVENT|ORGANIZATION|UNKNOWN",
      "description": "Short definition"
    }
  ],
  "relations": [
    {
      "source": "Entity Name",
      "target": "Entity Name",
      "label": "relationship label",
      "labelZh": "关系标签",
      "labelEn": "relationship label"
    }
  ]
}

Text to analyze:
"${text}"
`;
}

/**
 * 清理 LLM 输出中的 JSON
 */
function cleanJsonOutput(text) {
  let cleanText = text.trim();

  if (cleanText.startsWith('```json')) {
    cleanText = cleanText.replace(/^```json/, '').replace(/```$/, '');
  } else if (cleanText.startsWith('```')) {
    cleanText = cleanText.replace(/^```/, '').replace(/```$/, '');
  }

  cleanText = cleanText.trim();

  try {
    return JSON.parse(cleanText);
  } catch (error) {
    if (error instanceof SyntaxError) {
      const match = error.message.match(/position (\d+)/);
      if (match) {
        const pos = parseInt(match[1]);
        const start = Math.max(0, pos - 50);
        const end = Math.min(cleanText.length, pos + 50);
        console.error('JSON parse error near:', cleanText.substring(start, end));
      }
    }
    throw new Error(`JSON parse failed: ${error.message}`);
  }
}

/**
 * 使用 Claude API 提取知识图谱
 * @param {string} text - 输入文本
 * @param {Object} options - 选项
 * @returns {Promise<{entities: Array, relations: Array, metadata: Object}>}
 */
async function extractKnowledgeGraph(text, options = {}) {
  if (!CLAUDE_API_KEY) {
    throw new Error('CLAUDE_API_KEY environment variable is not set');
  }

  const model = options.model || CLAUDE_MODEL;
  const language = options.language || 'both';
  const prompt = generatePrompt(text, language);
  const startTime = Date.now();

  const endpoint = `${CLAUDE_API_BASE_URL}/v1/messages`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CLAUDE_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: 4000,
      messages: [
        {
          role: 'user',
          content: 'You are a knowledge extraction expert. Output strict JSON only.\n\n' + prompt
        }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API Error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const content = data.content?.[0]?.text;

  if (!content) {
    throw new Error('No content received from Claude API');
  }

  const parsed = cleanJsonOutput(content);

  const entities = (parsed.entities || []).map(e => ({
    id: e.name,
    name: e.name,
    nameZh: e.nameZh || e.name,
    nameEn: e.nameEn || e.name,
    type: e.type || 'UNKNOWN',
    description: e.description || ''
  }));

  const entityIds = new Set(entities.map(e => e.id));
  const relations = (parsed.relations || [])
    .map(r => ({
      source: r.source,
      target: r.target,
      label: r.label,
      labelZh: r.labelZh || r.label,
      labelEn: r.labelEn || r.label
    }))
    .filter(r => entityIds.has(r.source) && entityIds.has(r.target));

  const processingTime = Date.now() - startTime;

  return {
    entities,
    relations,
    metadata: {
      charCount: text.length,
      entityCount: entities.length,
      relationCount: relations.length,
      model,
      processingTime
    }
  };
}

module.exports = { extractKnowledgeGraph, generatePrompt, cleanJsonOutput };
