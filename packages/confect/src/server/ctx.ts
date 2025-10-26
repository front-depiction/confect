import type {
  GenericActionCtx,
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
} from "convex/server";
import { Context, Layer } from "effect";

const ConvexQueryCtxTag = Context.GenericTag<GenericQueryCtx<any>>(
  "@rjdellecese/confect/ConvexQueryCtx"
);

export class ConvexQueryCtx {
  static readonly layer = <DataModel extends GenericDataModel>(
    ctx: GenericQueryCtx<DataModel>
  ) => Layer.succeed(ConvexQueryCtxTag, ctx);
}

const ConvexMutationCtxTag = Context.GenericTag<GenericMutationCtx<any>>(
  "@rjdellecese/confect/ConvexMutationCtx"
);

export class ConvexMutationCtx {
  static readonly layer = <DataModel extends GenericDataModel>(
    ctx: GenericMutationCtx<DataModel>
  ) => Layer.succeed(ConvexMutationCtxTag, ctx);
}

const ConvexActionCtxTag = Context.GenericTag<GenericActionCtx<any>>(
  "@rjdellecese/confect/ConvexActionCtx"
);

export class ConvexActionCtx {
  static readonly layer = <DataModel extends GenericDataModel>(
    ctx: GenericActionCtx<DataModel>
  ) => Layer.succeed(ConvexActionCtxTag, ctx);
}
