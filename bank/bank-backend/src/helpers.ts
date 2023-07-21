export function serializeJson(input: any) {
  return JSON.parse(JSON.stringify(input, (key, value) =>
          typeof value === 'bigint'
              ? value.toString()
              : value // return everything else unchanged
      ));
}
