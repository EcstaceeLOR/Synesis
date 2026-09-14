export const joinClassNames = (
  ...classNames: ReadonlyArray<string | false | null | undefined>
): string => classNames.filter(Boolean).join(" ");
