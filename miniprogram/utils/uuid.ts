// UUID v4：用作创建请求的 clientId（幂等）和上传文件名

export function uuid(): string {
  const hex: string[] = [];
  for (let i = 0; i < 16; i++) {
    let b = Math.floor(Math.random() * 256);
    if (i === 6) b = (b & 0x0f) | 0x40; // 版本 4
    if (i === 8) b = (b & 0x3f) | 0x80; // RFC 4122 变体
    hex.push((b < 16 ? '0' : '') + b.toString(16));
  }
  const h = hex.join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
