import { AwsClient } from "aws4fetch";
import { describe, expect, test } from "vite-plus/test";
import { encodePath, presign } from "./sigv4.js";

const credentials = {
  accessKeyId: "AKIAIOSFODNN7EXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
};

describe("presign", () => {
  // https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-query-string-auth.html#query-string-auth-v4-signing-example
  test("matches the AWS documentation example", async () => {
    const url = await presign(credentials, {
      method: "GET",
      url: "https://examplebucket.s3.amazonaws.com/test.txt",
      expiresIn: 86400,
      now: Date.UTC(2013, 4, 24),
      region: "us-east-1",
    });
    expect(new URL(url).searchParams.get("X-Amz-Signature")).toBe(
      "aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404",
    );
  });

  test("matches aws4fetch for a PUT with signed headers and an encoded key", async () => {
    const now = Date.UTC(2026, 10, 15, 12, 30, 5);
    const objectUrl = `https://acc.r2.cloudflarestorage.com/bucket/${encodePath("a b/ñ+(1)!*.pdf")}`;
    const headers = {
      "content-type": "application/pdf",
      "if-none-match": "*",
      "x-amz-checksum-sha256": "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=",
    };
    const ours = await presign(credentials, {
      method: "PUT",
      url: objectUrl,
      headers,
      expiresIn: 300,
      now,
    });

    const client = new AwsClient({ ...credentials, service: "s3", region: "auto" });
    const theirs = await client.sign(`${objectUrl}?X-Amz-Expires=300`, {
      method: "PUT",
      headers,
      aws: {
        signQuery: true,
        allHeaders: true,
        datetime: new Date(now).toISOString().replace(/[:-]|\.\d{3}/g, ""),
      },
    });
    const params = (url: string) => Object.fromEntries(new URL(url).searchParams);
    expect(params(ours)).toEqual(params(theirs.url));
    expect(new URL(ours).pathname).toBe(new URL(theirs.url).pathname);
  });
});
