import { randomUUID, createHash } from "node:crypto";
import https from "node:https";
import { isIP } from "node:net";

const root = process.env.PILOT_EVIDENCE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const serviceKey = process.env.PILOT_EVIDENCE_SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SECRET_KEY;
const bucket = "pilot-student-evidence";
const dnsIp = process.env.PILOT_STORAGE_DNS_IP;
if (!root?.startsWith("https://") || !serviceKey || (dnsIp && isIP(dnsIp) !== 4)) {
  throw new Error("An HTTPS project URL, server-side key, and optional IPv4 DNS override are required");
}

function request(method, path, { auth = true, body, contentType } = {}) {
  const url = new URL(path, root);
  if (url.origin !== new URL(root).origin) throw new Error("Unexpected Storage URL origin");
  const bytes = body === undefined ? undefined : Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method, autoSelectFamily: false,
      ...(dnsIp ? { lookup: (_hostname, _options, done) => done(null, dnsIp, 4) } : {}),
      headers: {
        ...(auth ? { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } : {}),
        ...(contentType ? { "Content-Type": contentType } : {}),
        ...(bytes ? { "Content-Length": bytes.length } : {}),
        "Cache-Control": "no-store",
      },
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, bytes: Buffer.concat(chunks) }));
    });
    req.on("error", reject);
    req.end(bytes);
  });
}

function json(response) {
  try { return JSON.parse(response.bytes.toString("utf8")); }
  catch { throw new Error(`Storage returned non-JSON status ${response.status}`); }
}
function expectStatus(response, wanted, step) {
  if (response.status !== wanted) throw new Error(`${step} returned HTTP ${response.status}, expected ${wanted}`);
}

const bucketResponse = await request("GET", `/storage/v1/bucket/${bucket}`);
expectStatus(bucketResponse, 200, "Bucket inventory");
const settings = json(bucketResponse);
const expectedMime = ["application/pdf", "image/jpeg", "image/png"];
if (settings.public !== false || settings.file_size_limit !== 524288 ||
    JSON.stringify([...settings.allowed_mime_types].sort()) !== JSON.stringify(expectedMime)) {
  throw new Error("The staging bucket does not match the private evidence policy");
}

const objectKey = randomUUID();
const body = Buffer.from("%PDF-1.4\nsynthetic ticket 12 storage rehearsal\n");
const objectPath = `/storage/v1/object/${bucket}/${objectKey}`;
const report = { bucket, objectKey, startedAt: new Date().toISOString(),
  private: settings.public === false, limitBytes: settings.file_size_limit,
  mimeTypes: settings.allowed_mime_types, sha256: createHash("sha256").update(body).digest("hex") };
process.stderr.write(`Synthetic Storage rehearsal object key: ${objectKey}\n`);
let uploaded = false;
try {
  const upload = await request("POST", objectPath, { body, contentType: "application/pdf" });
  expectStatus(upload, 200, "Synthetic upload");
  uploaded = true;
  const authenticated = await request("GET", objectPath);
  expectStatus(authenticated, 200, "Authenticated read");
  if (!authenticated.bytes.equals(body)) throw new Error("Authenticated read bytes differ from upload");
  const publicRead = await request("GET", `/storage/v1/object/public/${bucket}/${objectKey}`, { auth: false });
  if (publicRead.status === 200) throw new Error("Private evidence was readable through a public URL");
  report.publicReadStatus = publicRead.status;

  const sign = await request("POST", `/storage/v1/object/sign/${bucket}/${objectKey}`,
    { body: { expiresIn: 60 }, contentType: "application/json" });
  expectStatus(sign, 200, "Signed URL creation");
  const signedPath = json(sign).signedURL;
  if (typeof signedPath !== "string" || !signedPath.startsWith("/object/sign/")) {
    throw new Error("Signed URL path was unexpected");
  }
  const signedUrlPath = `/storage/v1${signedPath}`;
  const signedRead = await request("GET", signedUrlPath, { auth: false });
  expectStatus(signedRead, 200, "Signed URL read before deletion");
  if (!signedRead.bytes.equals(body)) throw new Error("Signed URL bytes differ from upload");

  const removal = await request("DELETE", `/storage/v1/object/${bucket}`,
    { body: { prefixes: [objectKey] }, contentType: "application/json" });
  expectStatus(removal, 200, "Exact object deletion");
  const removed = json(removal);
  if (!Array.isArray(removed) || removed.length !== 1) throw new Error("Deletion did not report exactly one object");
  uploaded = false;
  const authenticatedAfter = await request("GET", objectPath);
  if (authenticatedAfter.status === 200) throw new Error("Deleted object remains readable with a service key");
  const signedAfter = await request("GET", signedUrlPath, { auth: false });
  if (signedAfter.status === 200) throw new Error("Deleted object remains readable through a signed URL");
  const infoAfter = await request("GET", `/storage/v1/object/info/${bucket}/${objectKey}`);
  if (infoAfter.status === 200) throw new Error("Deleted object metadata remains visible");
  const listing = await request("POST", `/storage/v1/object/list/${bucket}`,
    { body: { prefix: objectKey, limit: 100 }, contentType: "application/json" });
  expectStatus(listing, 200, "Post-deletion listing");
  if (json(listing).some((item) => item.name === objectKey)) throw new Error("Deleted object remains listed");
  Object.assign(report, { deletedReadStatus: authenticatedAfter.status,
    deletedSignedReadStatus: signedAfter.status, deletedInfoStatus: infoAfter.status,
    listingEmpty: true, completedAt: new Date().toISOString() });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally {
  if (uploaded) {
    const cleanup = await request("DELETE", `/storage/v1/object/${bucket}`,
      { body: { prefixes: [objectKey] }, contentType: "application/json" });
    if (cleanup.status !== 200) {
      throw new Error(`Synthetic Storage cleanup failed for ${objectKey}: HTTP ${cleanup.status}`);
    }
  }
}
