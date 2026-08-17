import { createServer as createHttpServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const indexPath = fileURLToPath(new URL("./public/index.html", import.meta.url));
const maxInputLength = 12_000;

const planSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "gaps", "sevenDayPlan"],
  properties: {
    summary: {
      type: "object",
      additionalProperties: false,
      required: ["matchScore", "verdict"],
      properties: {
        matchScore: { type: "integer", minimum: 0, maximum: 100 },
        verdict: { type: "string" }
      }
    },
    gaps: {
      type: "array",
      minItems: 1,
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["requirement", "resumeEvidence", "gap", "priority", "nextAction"],
        properties: {
          requirement: { type: "string" },
          resumeEvidence: { type: "string" },
          gap: { type: "string" },
          priority: { type: "string", enum: ["high", "medium", "low"] },
          nextAction: { type: "string" }
        }
      }
    },
    sevenDayPlan: {
      type: "array",
      minItems: 7,
      maxItems: 7,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["day", "goal", "task", "deliverable", "selfCheck"],
        properties: {
          day: { type: "integer", minimum: 1, maximum: 7 },
          goal: { type: "string" },
          task: { type: "string" },
          deliverable: { type: "string" },
          selfCheck: { type: "string" }
        }
      }
    }
  }
};

const questionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["question", "focus", "type"],
  properties: {
    question: { type: "string" },
    focus: { type: "string" },
    type: { type: "string", enum: ["product", "technical", "metrics", "project"] }
  }
};

const scoreSchema = {
  type: "object",
  additionalProperties: false,
  required: ["scores", "overall", "omissions", "suggestions", "sampleAnswer"],
  properties: {
    scores: {
      type: "object",
      additionalProperties: false,
      required: ["productStructure", "aiTechnicalJudgment", "metricsAwareness", "communication"],
      properties: {
        productStructure: { type: "integer", minimum: 1, maximum: 5 },
        aiTechnicalJudgment: { type: "integer", minimum: 1, maximum: 5 },
        metricsAwareness: { type: "integer", minimum: 1, maximum: 5 },
        communication: { type: "integer", minimum: 1, maximum: 5 }
      }
    },
    overall: { type: "string" },
    omissions: { type: "array", maxItems: 5, items: { type: "string" } },
    suggestions: { type: "array", minItems: 1, maxItems: 5, items: { type: "string" } },
    sampleAnswer: { type: "string" }
  }
};

export function createServer({ model = callCompatibleModel } = {}) {
  return createHttpServer(createHandler({ model }));
}

export function createHandler({ model = callCompatibleModel } = {}) {
  return async (request, response) => {
    try {
      const route = request.query?.path
        ? `/api/${[].concat(request.query.path).join("/")}`
        : new URL(request.url, "http://localhost").pathname;

      if (request.method === "GET" && route === "/api/health") {
        return sendJson(response, 200, { ok: true });
      }

      if (request.method === "GET" && route === "/") {
        const html = await readFile(indexPath);
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        return response.end(html);
      }

      if (request.method === "POST" && route === "/api/plan") {
        const body = await readJson(request);
        const resume = requiredText(body.resume, "简历");
        const jobDescription = requiredText(body.jobDescription, "岗位 JD");
        const result = await model({
          apiKey: request.headers["x-ai-api-key"],
          schemaName: "ai_pm_growth_plan",
          schema: planSchema,
          instructions: [
            "你是严谨的 AI 产品经理求职教练，使用简体中文回答。",
            "只根据用户提供的简历和 JD 判断；不得编造经历、技能或数字。",
            "每个已具备能力都要在 resumeEvidence 中引用或概括简历证据，没有证据就明确写未发现相关证据。",
            "gap 必须对应 JD 要求。nextAction 和七天任务要在学生可执行范围内，并产出可检查的成果。",
            "matchScore 是基于当前文本的启发式匹配度，不是招聘通过率。"
          ].join("\n"),
          input: { resume, jobDescription }
        });

        if (!isPlan(result)) throw new HttpError(502, "模型返回的成长方案不完整，请重试");
        return sendJson(response, 200, result);
      }

      if (request.method === "POST" && route === "/api/interview/question") {
        const body = await readJson(request);
        const jobDescription = requiredText(body.jobDescription, "岗位 JD");
        const gaps = Array.isArray(body.gaps) ? body.gaps.slice(0, 6) : [];
        const previousQuestions = Array.isArray(body.previousQuestions)
          ? body.previousQuestions.filter((item) => typeof item === "string").slice(-10)
          : [];
        if (!gaps.length) throw new HttpError(400, "请先生成成长方案");

        const result = await model({
          apiKey: request.headers["x-ai-api-key"],
          schemaName: "ai_pm_interview_question",
          schema: questionSchema,
          instructions: [
            "你是 AI 产品经理面试官，使用简体中文。",
            "基于目标 JD 和能力差距只生成一道具体、可作答的问题。",
            "优先考察高优先级差距；避开 previousQuestions 中已经问过的内容。",
            "问题应检验产品判断，而不是要求背诵定义。"
          ].join("\n"),
          input: { jobDescription, gaps, previousQuestions }
        });
        if (!isQuestion(result)) throw new HttpError(502, "模型返回的面试题不完整，请重试");
        return sendJson(response, 200, result);
      }

      if (request.method === "POST" && route === "/api/interview/score") {
        const body = await readJson(request);
        const question = requiredText(body.question, "面试题");
        const answer = requiredText(body.answer, "回答");
        const jobDescription = requiredText(body.jobDescription, "岗位 JD");

        const result = await model({
          apiKey: request.headers["x-ai-api-key"],
          schemaName: "ai_pm_interview_score",
          schema: scoreSchema,
          instructions: [
            "你是严格但具体的 AI 产品经理面试官，使用简体中文。",
            "分别按产品结构、AI 技术判断、指标意识、表达清晰度打 1 到 5 分。",
            "评分必须基于用户回答，不因语言华丽抬高分数。",
            "建议要可执行；参考回答不得虚构用户经历或业务数据，缺少时用【待补充】标明。"
          ].join("\n"),
          input: { jobDescription, question, answer }
        });
        if (!isScore(result)) throw new HttpError(502, "模型返回的评分不完整，请重试");
        return sendJson(response, 200, result);
      }

      sendJson(response, 404, { error: "页面不存在" });
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      const message = error instanceof HttpError ? error.message : "服务暂时不可用，请稍后重试";
      if (status >= 500) console.error(error);
      sendJson(response, status, { error: message });
    }
  };
}

async function callCompatibleModel({ apiKey: suppliedApiKey, schemaName, schema, instructions, input }) {
  const apiKey = (typeof suppliedApiKey === "string" ? suppliedApiKey.trim() : "")
    || process.env.AI_API_KEY
    || process.env.DEEPSEEK_API_KEY;
  const baseUrl = (process.env.AI_API_BASE_URL || "https://api.deepseek.com").replace(/\/$/, "");
  const model = process.env.AI_MODEL || "deepseek-v4-pro";
  if (!apiKey) throw new HttpError(503, "请在网页顶部填写 DeepSeek API Key");
  if (apiKey.length > 500) throw new HttpError(400, "API Key 格式不正确");

  let response;
  let payload;
  let errorDetail = "";
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model,
        stream: false,
        thinking: { type: "disabled" },
        max_tokens: 2500,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `${instructions}\n只返回一个 JSON 对象，不要使用 Markdown。输出名称：${schemaName}。必须符合以下 JSON Schema：\n${JSON.stringify(schema)}`
          },
          { role: "user", content: JSON.stringify(input) }
        ]
      }),
      signal: AbortSignal.timeout(120_000)
    });
    if (response.ok) payload = await response.json();
    else errorDetail = await response.text();
  } catch (error) {
    console.error("[model] connection failed", {
      name: error?.name,
      message: error?.message,
      code: error?.cause?.code
    });
    if (error?.name === "TimeoutError") {
      throw new HttpError(504, "模型生成超过 120 秒，请精简简历或稍后重试");
    }
    throw new HttpError(502, "无法连接模型服务，请检查网络后重试");
  }

  if (!response.ok) {
    console.error(`Model API ${response.status}: ${errorDetail.slice(0, 500)}`);
    if (response.status === 401) throw new HttpError(502, "API Key 无效或已失效，请重新配置");
    if (response.status === 403) throw new HttpError(502, "当前 API Key、项目或网络区域无权访问该模型");
    if (response.status === 429) throw new HttpError(502, "API 额度不足或请求过快，请检查账单和用量限制");
    if (response.status === 400 || response.status === 404) throw new HttpError(502, "模型名称或请求参数不可用，请检查 AI_MODEL 和 AI_API_BASE_URL");
    throw new HttpError(502, "模型服务暂时不可用，请稍后重试");
  }

  const text = payload.choices?.[0]?.message?.content;
  if (!text) throw new HttpError(502, "模型没有返回可用结果，请重试");
  try {
    return JSON.parse(text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
  } catch {
    throw new HttpError(502, "模型返回格式异常，请重试");
  }
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 30_000) throw new HttpError(413, "输入内容过长，请精简后重试");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "请求格式不正确");
  }
}

function requiredText(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new HttpError(400, `请填写${label}`);
  const text = value.trim();
  if (text.length > maxInputLength) throw new HttpError(400, `${label}不能超过 ${maxInputLength} 字`);
  return text;
}

function isPlan(value) {
  return Boolean(
    value &&
    Number.isInteger(value.summary?.matchScore) &&
    typeof value.summary?.verdict === "string" &&
    Array.isArray(value.gaps) &&
    value.gaps.length > 0 &&
    Array.isArray(value.sevenDayPlan) &&
    value.sevenDayPlan.length === 7
  );
}

function isQuestion(value) {
  return Boolean(value && typeof value.question === "string" && typeof value.focus === "string");
}

function isScore(value) {
  const scores = value?.scores;
  return Boolean(
    scores &&
    [scores.productStructure, scores.aiTechnicalJudgment, scores.metricsAwareness, scores.communication]
      .every((score) => Number.isInteger(score) && score >= 1 && score <= 5) &&
    typeof value.overall === "string" &&
    Array.isArray(value.suggestions) &&
    typeof value.sampleAnswer === "string"
  );
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendJson(response, status, value) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[2] || process.env.PORT || 3000);
  createServer().listen(port, "127.0.0.1", () => {
    console.log(`AI PM Coach: http://127.0.0.1:${port}`);
  });
}

