import Anthropic from '@anthropic-ai/sdk';
import { loadSettings } from './app-settings';
import * as repo from './repo';
import type { AiMessage, Employee } from './types';

/**
 * 「AI に質問する」の応答。会社の方針（設定画面で登録）と、今の状況（連絡・配車・報告）を
 * 渡したうえで、運転業務の従業員に短く答えさせる。
 * ANTHROPIC_API_KEY が未設定の場合は使えない（画面側で案内する）。
 */
const MODEL = 'claude-opus-5';
const MAX_TOKENS = 1024; // 受付画面で読む長さに収めるため、意図的に短くしている
const MAX_QUESTION_LENGTH = 500;
const MAX_QUESTIONS_PER_HOUR = 30;
const HISTORY_TURNS = 10;

export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function systemPrompt(companyName: string, instructions: string, context: string): string {
  return [
    `あなたは「${companyName}」の社内 AI 受付です。運転業務の従業員に応対します。`,
    '',
    '【応対の方針】',
    '- 会社の立場に立ち、就業規則やマニュアルに沿って公正に応対する',
    '- 3〜4 文程度で簡潔に。運転前後に読むため、専門用語や長い説明は避ける',
    '- 規則に書かれていないこと・判断が必要なことは推測せず、「担当者に確認してください」と伝える',
    '- 事故・けが・車両トラブルなど緊急の内容は、まず安全の確保と会社への電話連絡を促す',
    '- 給与や処分など個人の事情に関わる判断はせず、担当者につなぐ',
    '',
    '【会社からの指示】',
    instructions.trim() || '（未設定。会社固有の規則は分からないため、担当者への確認を促してください）',
    '',
    '【今の状況】',
    context.trim() || '（特になし）',
  ].join('\n');
}

export interface AskResult {
  answer: string;
}

export async function askAi(input: {
  employee: Employee;
  question: string;
  context: string;
  history?: AiMessage[];
}): Promise<AskResult> {
  const question = input.question.trim();
  if (!question) throw new Error('質問を入力してください。');
  if (question.length > MAX_QUESTION_LENGTH) {
    throw new Error(`質問は ${MAX_QUESTION_LENGTH} 文字以内で入力してください。`);
  }
  if (!isAiConfigured()) {
    throw new Error('AI の設定（ANTHROPIC_API_KEY）が未設定です。担当者にご連絡ください。');
  }

  // 1 人あたりの利用回数に上限を設ける（費用が想定外に増えないようにするため）。
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
  if (repo.countAiMessagesSince(input.employee.id, since) >= MAX_QUESTIONS_PER_HOUR) {
    throw new Error('質問が続いたため、しばらく利用できません。急ぎの場合は担当者にお電話ください。');
  }

  const settings = loadSettings();
  const history = (input.history ?? repo.listAiMessages(input.employee.id, HISTORY_TURNS * 2)).map((message) => ({
    role: message.role,
    content: message.body,
  })) satisfies Anthropic.MessageParam[];

  const client = new Anthropic();

  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      // 受付での応答は速さを優先する。
      output_config: { effort: 'low' },
      system: systemPrompt(settings.companyName, settings.aiInstructions, input.context),
      messages: [...history, { role: 'user', content: `${input.employee.name} さんからの質問: ${question}` }],
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      throw new Error('AI の認証に失敗しました（API キーをご確認ください）。');
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new Error('AI が混み合っています。少し時間をおいてからお試しください。');
    }
    if (error instanceof Anthropic.APIError) {
      throw new Error(`AI に接続できませんでした（${error.status}）。担当者にご連絡ください。`);
    }
    throw new Error('AI に接続できませんでした。通信状況をご確認ください。');
  }

  if (response.stop_reason === 'refusal') {
    throw new Error('この内容にはお答えできません。担当者にご確認ください。');
  }

  const answer = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();

  if (!answer) throw new Error('回答を作れませんでした。もう一度お試しください。');

  repo.appendAiMessage(input.employee.id, 'user', question);
  repo.appendAiMessage(input.employee.id, 'assistant', answer);

  return { answer };
}
