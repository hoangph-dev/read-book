import { layoutPage } from '../lib/extract';

const it = (str: string, xx: number, y: number, h = 12, w = str.length * 6 + 3) => ({
  str,
  width: w,
  height: h,
  transform: [1, 0, 0, h, xx, y],
});

let cx = 60;
const word = (s: string, y: number) => {
  const t = it(s, cx, y);
  cx += t.width + 3;
  return t;
};
const line = (y: number, ...words: string[]) => {
  cx = 60;
  return words.map((w) => word(w, y));
};

let fails = 0;

function T(label: string, items: unknown[], expectedSub: string[]): void {
  const out = layoutPage(items as { str?: string; transform?: number[]; width?: number; height?: number }[]);
  const ok = expectedSub.every((s) => out.includes(s));
  console.log((ok ? 'PASS' : 'FAIL'), label, '→', JSON.stringify(out.slice(0, 140)));
  if (!ok) fails += 1;
}

T('2 cột: đọc hết cột A rồi cột B', [
  ...line(700, 'Cot', 'A', 'dong', 'mot'),
  it('Cot', 400, 697), it('B', 424, 697), it('dong', 439, 697), it('mot', 469, 697),
  ...line(660, 'Cot', 'A', 'dong', 'hai'),
  it('Cot', 400, 657), it('B', 424, 657), it('dong', 439, 657), it('hai', 469, 657),
  ...line(620, 'Cot', 'A', 'dong', 'ba'),
  it('Cot', 400, 617), it('B', 424, 617), it('dong', 439, 617), it('ba', 469, 617),
], ['Cot A dong mot Cot A dong hai Cot A dong ba', 'Cot B dong mot Cot B dong hai Cot B dong ba']);

T('dấu tách rời giữa chữ: không chèn space', [
  ...line(700, 'Troi', 'hom', 'nay'),
  it('mu', 60, 600), it('\u0302', 66, 600, 7, 0), it('a', 72, 600),
  it('thu', 85, 600), it('tet', 112, 600),
], ['Troi hom nay', 'mûa thu tet']);

T('từ bị tách run: ghép đúng 1 space', [...line(700, 'Dong', 'dau', 'tien', 'cua', 'truyen')], [
  'Dong dau tien cua truyen',
]);

T('bỏ item trùng lặp overlay (bóng chữ)', [
  ...line(700, 'Mot', 'dong', 'van', 'ban'),
  it('Mot', 60.3, 700.3), it('dong', 84.3, 700.3), it('van', 114.3, 700.3), it('ban', 138.3, 700.3),
  ...line(660, 'Dong', 'thu', 'hai'),
], ['Mot dong van ban Dong thu hai']);

T('tách 2 dòng leading nhỏ', [...line(700, 'Dong', 'tren'), ...line(688, 'Dong', 'duoi')], [
  'Dong tren Dong duoi',
]);

T('tách đoạn khi gap lớn', [
  ...line(700, 'Doan', 'mot', 'cua', 'sach'),
  ...line(660, 'Dong', 'tiep', 'theo', 'doan', 'mot'),
  ...line(500, 'Doan', 'hai', 'bat', 'dau'),
], ['Doan mot cua sach Dong tiep theo doan mot', 'Doan hai bat dau']);

T('số trang sau chữ', [...line(700, 'Van', 'ban', 'chinh', 'giua', 'trang'), it('12', cx, 700)], [
  'Van ban chinh giua trang 12',
]);

T('dòng thụt vào vẫn cùng dòng khối', [
  ...line(700, 'Dong', 'dau'),
  ...line(660, 'Dong', 'thu', 'hai', 'thut', 'vao'),
], ['Dong dau Dong thu hai thut vao']);

if (fails) {
  console.error(`${fails} test thất bại`);
  process.exit(1);
}
console.log('OK — tất cả test layout pass');