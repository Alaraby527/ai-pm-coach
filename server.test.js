import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "./server.js";

const samplePlan = {
  summary: { matchScore: 58, verdict: "具备产品基础，需要补足 AI 实践。" },
  gaps: [{
    requirement: "理解 RAG",
    resumeEvidence: "未发现相关证据",
    gap: "缺少 RAG 产品实践",
    priority: "high",
    nextAction: "画出一张 RAG 问答流程图"
  }],
  sevenDayPlan: Array.from({ length: 7 }, (_, index) => ({
    day: index + 1,
    goal: `目标 ${index + 1}`,
    task: "完成一个学习任务",
    deliverable: "一页笔记",
    selfCheck: "能否用自己的话说明？"
  }))
};

const sampleQuestion = {
  question: "RAG 回答不准时，你会如何定位问题？",
  focus: "问题拆解与技术协作",
  type: "technical"
};

const sampleScore = {
  scores: { productStructure: 4, aiTechnicalJudgment: 3, metricsAwareness: 2, communication: 4 },
  overall: "结构清晰，但缺少可量化的评估方法。",
  omissions: ["没有区分检索与生成问题"],
  suggestions: ["先查看检索命中率，再评估生成忠实度"],
  sampleAnswer: "我会先用测试集区分检索错误与生成错误，再分别优化。"
};

test("成长方案接口完成输入到结构化输出闭环", async (context) => {
  let receivedKey;
  const server = createServer({ model: async ({ apiKey }) => { receivedKey = apiKey; return samplePlan; } });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => server.close());
  const { port } = server.address();

  const response = await fetch(`http://127.0.0.1:${port}/api/plan`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-ai-api-key": "test-key" },
    body: JSON.stringify({ resume: "有产品分析项目", jobDescription: "要求理解 RAG" })
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), samplePlan);
  assert.equal(receivedKey, "test-key");
});

test("成长方案接口拒绝空输入", async (context) => {
  const server = createServer({ model: async () => samplePlan });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => server.close());
  const { port } = server.address();

  const response = await fetch(`http://127.0.0.1:${port}/api/plan`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ resume: "", jobDescription: "要求理解 RAG" })
  });

  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, "请填写简历");
});

test("模拟面试完成出题到四维评分闭环", async (context) => {
  const model = async ({ schemaName }) => ({
    ai_pm_interview_question: sampleQuestion,
    ai_pm_interview_score: sampleScore
  })[schemaName];
  const server = createServer({ model });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => server.close());
  const { port } = server.address();

  const questionResponse = await fetch(`http://127.0.0.1:${port}/api/interview/question`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jobDescription: "要求理解 RAG",
      gaps: samplePlan.gaps,
      previousQuestions: []
    })
  });
  assert.equal(questionResponse.status, 200);
  assert.deepEqual(await questionResponse.json(), sampleQuestion);

  const scoreResponse = await fetch(`http://127.0.0.1:${port}/api/interview/score`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jobDescription: "要求理解 RAG",
      question: sampleQuestion.question,
      answer: "我会先检查检索结果，再调整提示词。"
    })
  });
  assert.equal(scoreResponse.status, 200);
  assert.deepEqual(await scoreResponse.json(), sampleScore);
});



test("面试题接口拒绝不符合枚举的题型", async (context) => {
  const server = createServer({ model: async () => ({ ...sampleQuestion, type: "unknown" }) });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => server.close());
  const { port } = server.address();

  const response = await fetch(`http://127.0.0.1:${port}/api/interview/question`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jobDescription: "要求理解 RAG",
      gaps: samplePlan.gaps,
      previousQuestions: []
    })
  });

  assert.equal(response.status, 502);
});
