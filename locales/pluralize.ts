/**
 * CLDR plural-category helpers. English only distinguishes one/other; ru and
 * uk share the same Slavic three-way rule (one/few/many) — kept here once
 * rather than duplicated in both locale files.
 */

export function englishPlural<T>(n: number, forms: { one: T; other: T }): T {
  return n === 1 ? forms.one : forms.other
}

export function slavicPlural<T>(n: number, forms: { one: T; few: T; many: T }): T {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return forms.one
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return forms.few
  return forms.many
}
