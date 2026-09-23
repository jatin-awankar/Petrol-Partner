import { env } from "../../config/env";
import { createAcknowledgementPrototypeApp } from "./acknowledgement.app";

const receiptPath = process.env.ACKNOWLEDGEMENT_RECEIPT_PATH;
const receiptSecret = process.env.ACKNOWLEDGEMENT_RECEIPT_SECRET;
const operatorToken = process.env.ACKNOWLEDGEMENT_OPERATOR_TOKEN;

if (!receiptPath || !receiptSecret || !operatorToken) {
  throw new Error(
    "ACKNOWLEDGEMENT_RECEIPT_PATH, ACKNOWLEDGEMENT_RECEIPT_SECRET, and ACKNOWLEDGEMENT_OPERATOR_TOKEN are required",
  );
}

const app = createAcknowledgementPrototypeApp({
  databaseUrl: env.DATABASE_URL,
  receiptPath,
  receiptSecret,
  operatorToken,
});

app.listen(env.PORT, env.HOST, () => {
  process.stdout.write(`Acknowledgement recovery prototype listening on ${env.HOST}:${env.PORT}\n`);
});
