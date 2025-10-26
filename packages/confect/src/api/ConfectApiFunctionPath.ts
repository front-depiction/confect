export type ConfectApiFunctionPath<
  GroupName extends string,
  FunctionName extends string,
> = `${GroupName}__${FunctionName}`;

export type ConfectApiFunctionPathAny = ConfectApiFunctionPath<string, string>;

export const make = <GroupName extends string, FunctionName extends string>(
  groupName: GroupName,
  functionName: FunctionName
): ConfectApiFunctionPath<GroupName, FunctionName> =>
  `${groupName}__${functionName}`;
