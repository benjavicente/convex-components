import { uploadFile } from "@benjavicente/convex-r2/browser";
import { ConvexClient } from "convex/browser";
import { api } from "../convex/_generated/api";

const convex = new ConvexClient(import.meta.env.CONVEX_URL);
const form = document.querySelector<HTMLFormElement>("#upload")!;
const progress = form.querySelector("progress")!;
const output = form.querySelector("output")!;
const list = document.querySelector<HTMLUListElement>("#documents")!;

let unsubscribe = () => {};
function watch(folder: string) {
  unsubscribe();
  unsubscribe = convex.onUpdate(api.documents.list, { folder }, (documents) => {
    list.replaceChildren(
      ...documents.map((document) => {
        const item = create("li", `${document.name} (${document.size} bytes) `);
        item.append(
          button("Download", async () => {
            const url = await convex.mutation(api.documents.getUrl, { documentId: document._id });
            if (url) location.assign(url);
          }),
          button("Delete", () =>
            convex.mutation(api.documents.remove, { documentId: document._id }),
          ),
        );
        return item;
      }),
    );
  });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const folder = data.get("folder") as string;
  watch(folder);
  output.value = "Uploading…";
  try {
    const { confirmed } = await uploadFile(data.get("file") as File, {
      request: (file) => convex.mutation(api.documents.requestUpload, { folder, ...file }),
      confirm: (uploadId) => convex.action(api.documents.confirmUpload, { uploadId }),
      onProgress: ({ loaded, total }) => (progress.value = loaded / total),
    });
    output.value = confirmed?.status ?? "";
  } catch (error) {
    output.value = String(error);
  }
});
watch(new FormData(form).get("folder") as string);

function create(tag: string, text: string) {
  const element = document.createElement(tag);
  element.textContent = text;
  return element;
}
function button(text: string, onClick: () => unknown) {
  const element = create("button", text) as HTMLButtonElement;
  element.addEventListener("click", onClick);
  return element;
}
