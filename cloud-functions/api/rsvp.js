import { getStore } from "@edgeone/pages-blob";

const store = getStore({
  name: "avalon-rsvp",
  consistency: "strong",
});

const EVENT_ID = "avalon-2026-09-26";
const PREFIX = `rsvp/${EVENT_ID}/`;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function validResponse(value) {
  return ["join", "maybe", "no"].includes(value);
}

function safeClientId(value) {
  return String(value || "")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 80);
}

async function getAllRecords() {
  const { blobs } = await store.list({
    prefix: PREFIX,
    consistency: "strong",
  });

  const records = await Promise.all(
    blobs.map(async ({ key }) => {
      try {
        return await store.get(key, {
          type: "json",
          consistency: "strong",
        });
      } catch {
        return null;
      }
    })
  );

  return records
    .filter(Boolean)
    .sort((a, b) =>
      String(a.updated_at || "").localeCompare(String(b.updated_at || ""))
    );
}

export async function onRequestGet() {
  try {
    const records = await getAllRecords();

    return json({
      ok: true,
      records,
      counts: {
        join: records.filter((x) => x.response === "join").length,
        maybe: records.filter((x) => x.response === "maybe").length,
        no: records.filter((x) => x.response === "no").length,
      },
    });
  } catch (error) {
    console.error(error);
    return json(
      {
        ok: false,
        error: "Failed to load RSVP data",
      },
      500
    );
  }
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();

    const clientId = safeClientId(body.client_id);
    const nickname = String(body.nickname || "").trim().slice(0, 18);
    const response = String(body.response || "");

    if (!clientId) {
      return json({ ok: false, error: "client_id is required" }, 400);
    }

    if (!nickname) {
      return json({ ok: false, error: "nickname is required" }, 400);
    }

    if (!validResponse(response)) {
      return json({ ok: false, error: "invalid response" }, 400);
    }

    const key = `${PREFIX}${clientId}.json`;

    const oldRecord = await store.get(key, {
      type: "json",
      consistency: "strong",
    });

    const now = new Date().toISOString();

    const record = {
      event_id: EVENT_ID,
      client_id: clientId,
      nickname,
      response,
      created_at: oldRecord?.created_at || now,
      updated_at: now,
    };

    await store.setJSON(key, record);

    return json({
      ok: true,
      record,
    });
  } catch (error) {
    console.error(error);
    return json(
      {
        ok: false,
        error: "Failed to save RSVP",
      },
      500
    );
  }
}
