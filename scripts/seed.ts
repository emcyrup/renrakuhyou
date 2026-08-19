/**
 * 動作確認用のサンプルデータを投入する。
 *   npm run db:seed
 * 送信はモックプロバイダで行われるため、外部サービスの設定なしで一連の流れを試せる。
 */
import { createEmployee, createMessage, listEmployees } from '../src/lib/repo';

const SAMPLE_EMPLOYEES = [
  { name: '山田 太郎', department: '営業部', phone: '090-0000-0001' },
  { name: '佐藤 花子', department: '営業部', phone: '090-0000-0002' },
  { name: '鈴木 一郎', department: '製造部', phone: '090-0000-0003' },
  { name: '田中 美咲', department: '製造部', phone: '' },
  { name: '高橋 健', department: '総務部', phone: '090-0000-0005' },
];

function main() {
  if (listEmployees().length > 0) {
    console.log('従業員がすでに登録されているため、投入を中止しました。');
    return;
  }

  const ids = SAMPLE_EMPLOYEES.map((employee, index) =>
    createEmployee({
      ...employee,
      provider: 'mock',
      providerUserId: `mock-user-${index + 1}`,
    }),
  );

  createMessage({
    title: '【全社】年末年始の休業について',
    body: '12/29〜1/3 を休業といたします。\n緊急時の連絡先は各部署の掲示をご確認ください。',
    level: 'normal',
    createdBy: 'seed',
    employeeIds: ids,
  });

  createMessage({
    title: '【重要】明日の出勤時間変更のお知らせ',
    body: '設備点検のため、明日の始業を 10:00 に変更します。\n内容を確認のうえ、担当者からの電話にもご対応ください。',
    level: 'high',
    createdBy: 'seed',
    employeeIds: ids.slice(0, 3),
  });

  console.log(`従業員 ${ids.length} 名とサンプル連絡 2 件を作成しました。`);
}

main();
