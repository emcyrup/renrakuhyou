/**
 * Web Push に使う VAPID 鍵を生成する。
 *   npm run push:keys
 * 出力された 2 行を .env に貼り付ける。鍵を変更すると既存の購読は無効になる。
 */
import webpush from 'web-push';

const keys = webpush.generateVAPIDKeys();

console.log('# .env に貼り付けてください');
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log('VAPID_SUBJECT=mailto:admin@example.co.jp');
