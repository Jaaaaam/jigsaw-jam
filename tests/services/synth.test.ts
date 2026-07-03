import { describe, expect, test } from "vitest";
import {
  defaultVariant,
  eventForSound,
  renderSound,
  SOUND_EVENTS,
  SOUND_VARIANTS,
} from "@/services/sound/synth";

describe("renderSound", () => {
  test("produces a WAV data URI", () => {
    const uri = renderSound("click");
    expect(uri.startsWith("data:audio/wav;base64,")).toBe(true);
    const bytes = Buffer.from(uri.split(",")[1]!, "base64");
    expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(bytes.subarray(8, 12).toString("ascii")).toBe("WAVE");
    expect(bytes.length).toBeGreaterThan(44); // header + samples
  });

  // Noise layers are intentionally non-deterministic, so compare durations
  // (sample counts) rather than exact bytes.
  const wavSamples = (uri: string) => Buffer.from(uri.split(",")[1]!, "base64").length;

  test("variants render different audio", () => {
    expect(wavSamples(renderSound("snap", "lock"))).not.toBe(wavSamples(renderSound("snap", "chime")));
  });

  test("unknown variant falls back to the default", () => {
    expect(wavSamples(renderSound("snap", "nonsense"))).toBe(
      wavSamples(renderSound("snap", defaultVariant("snap"))),
    );
    expect(wavSamples(renderSound("snap", "nonsense"))).not.toBe(
      wavSamples(renderSound("snap", "chime")),
    );
  });

  test("every advertised variant renders", () => {
    for (const [event, variants] of Object.entries(SOUND_VARIANTS)) {
      for (const v of variants!) {
        const uri = renderSound(event as never, v.id);
        expect(uri.startsWith("data:audio/wav;base64,")).toBe(true);
      }
    }
  });
});

describe("eventForSound", () => {
  test("UI-ish sounds group into the ui event", () => {
    expect(eventForSound("click")).toBe("ui");
    expect(eventForSound("pop")).toBe("ui");
    expect(eventForSound("whoosh")).toBe("ui");
    expect(eventForSound("snap")).toBe("snap");
  });

  test("every event id is unique", () => {
    const ids = SOUND_EVENTS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
