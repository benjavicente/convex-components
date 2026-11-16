import { R2 } from "../../src/client/index.js";
export declare const r2: R2;
export declare const RULES: {
  maxSize: number;
  contentTypes: string[];
};
export declare const request: import("convex/server").RegisteredMutation<
  "public",
  {
    file: {
      contentType: string;
      name: string;
      sha256: string;
      size: number;
    };
    refuse?: boolean | undefined;
  },
  Promise<import("../../src/client/index.js").RequestedUpload>
>;
export declare const onConfirm: import("convex/server").RegisteredMutation<
  "internal",
  {
    context: {
      refuse: boolean;
    };
    upload: {
      bucket: string;
      contentType: string;
      key: string;
      name: string;
      sha256: string;
      size: number;
      uploadId: string;
    };
  },
  Promise<void>
>;
export declare const confirm: import("convex/server").RegisteredAction<
  "public",
  {
    uploadId: string;
  },
  Promise<
    | {
        status: "ready";
      }
    | {
        status: "notUploaded";
      }
    | {
        reason: string;
        status: "rejected";
      }
    | {
        status: "missing";
      }
  >
>;
export declare const store: import("convex/server").RegisteredAction<
  "public",
  {
    text: string;
  },
  Promise<
    (
      | {
          status: "ready";
        }
      | {
          status: "notUploaded";
        }
      | {
          reason: string;
          status: "rejected";
        }
      | {
          status: "missing";
        }
    ) & {
      uploadId: string;
    }
  >
>;
export declare const get: import("convex/server").RegisteredQuery<
  "public",
  {
    uploadId: string;
  },
  Promise<{
    bucket: string;
    contentType: string;
    key: string;
    link: string;
    name: string;
    sha256: string;
    size: number;
    uploadId: string;
  } | null>
>;
export declare const getUrl: import("convex/server").RegisteredQuery<
  "public",
  {
    uploadId: string;
  },
  Promise<string | null>
>;
export declare const remove: import("convex/server").RegisteredMutation<
  "public",
  {
    uploadId: string;
  },
  Promise<void>
>;
export declare const documents: import("convex/server").RegisteredQuery<
  "public",
  {},
  Promise<any[]>
>;
