import "../env-config";

import { Solari } from "@solarisdk/browser";

import { createSolariAdapters } from "../src/lib/solari/factory";

function invariant(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

const apiKey = process.env.SOLARI_API_KEY;
invariant(apiKey, "SOLARI_API_KEY is required for the live computer-use check.");

const adapters = await createSolariAdapters();
let profileId: string | null = null;

try {
  const observed = await adapters.browserComputer.operate({
    participantRef: "live-computer-check",
    startUrl: "https://httpbin.org/forms/post",
    allowedOrigins: ["https://httpbin.org"],
    actions: [],
  });
  profileId = observed.profileId;
  const name = observed.page.controls.find((control) => control.text === "custname");
  const submit = observed.page.controls.find(
    (control) =>
      control.inputType === "submit" ||
      control.text.toLowerCase().includes("submit"),
  );
  invariant(name && submit, "The live form controls were not discoverable.");

  const operated = await adapters.browserComputer.operate({
    participantRef: "live-computer-check",
    profileId,
    startUrl: "https://httpbin.org/forms/post",
    allowedOrigins: ["https://httpbin.org"],
    actions: [
      { type: "fill", ref: name.ref, value: "Sylla live check" },
      { type: "click", ref: submit.ref },
    ],
  });
  invariant(
    operated.page.text.includes("Sylla live check"),
    "The submitted value was not present on the destination page.",
  );

  console.log(
    JSON.stringify({
      provider: operated.provider,
      profileReused: operated.profileId === profileId,
      discoveredControls: observed.page.controls.length,
      actionsCompleted: operated.actionsCompleted,
      finalUrl: operated.page.url,
      formSubmitted: true,
      profileSaved: operated.profileSaved,
    }),
  );
} finally {
  if (profileId) {
    const client = new Solari({
      apiKey,
      baseUrl: process.env.SOLARI_BASE_URL,
    });
    await client.profiles.delete(profileId).catch(() => undefined);
    await client.close();
  }
}
