// 生成 miniprogram/data/who.ts：从 WHO anthro R 包下载按天的 LMS 数据，按月龄 0–60 取样
// 用法：node scripts/gen-who.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = 'https://api.github.com/repos/WorldHealthOrganization/anthro/contents/data-raw/growthstandards/';
const FILES = { height: 'lenanthro.txt', weight: 'weianthro.txt', head: 'hcanthro.txt' };
const SEXES = { male: '1', female: '2' };

async function download(file) {
  const res = await fetch(BASE + file, { headers: { Accept: 'application/vnd.github.raw' } });
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  return (await res.text()).trim().split('\n').slice(1).map((l) => l.trim().split(/\s+/));
}

const out = { male: {}, female: {} };
for (const [key, file] of Object.entries(FILES)) {
  const rows = await download(file);
  for (const [sex, sexId] of Object.entries(SEXES)) {
    const byDay = new Map(rows.filter((r) => r[0] === sexId).map((r) => [Number(r[1]), r.slice(2, 5).map(Number)]));
    out[sex][key] = Array.from({ length: 61 }, (_, m) => {
      const lms = byDay.get(Math.round(m * 30.4375));
      if (!lms) throw new Error(`missing ${key} ${sex} ${m}`);
      return lms;
    });
  }
}

const fmt = (list) => '[\n' + list.map((r) => `    [${r.join(', ')}],`).join('\n') + '\n  ]';
const table = (sex) => `{\n  height: ${fmt(out[sex].height)},\n  weight: ${fmt(out[sex].weight)},\n  head: ${fmt(out[sex].head)},\n}`;
const ts = `// WHO 儿童生长标准（0–5 岁）的 LMS 参数，按月龄 0–60 每月一行：[L, M, S]
// 来源：WHO anthro R 包 data-raw/growthstandards（lenanthro / weianthro / hcanthro），按天的数据取第 round(月龄 × 30.4375) 天
// 身高：0–24 月为卧位身长，24 月以后为立位身高
// 由 scripts/gen-who.mjs 生成，勿手改

export type LmsRow = [number, number, number];
export interface WhoTable {
  height: LmsRow[];
  weight: LmsRow[];
  head: LmsRow[];
}

export const WHO_MALE: WhoTable = ${table('male')};

export const WHO_FEMALE: WhoTable = ${table('female')};
`;
const target = fileURLToPath(new URL('../miniprogram/data/who.ts', import.meta.url));
writeFileSync(target, ts);
console.log('written', target);
