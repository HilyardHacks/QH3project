import { initializeApp, getApps, cert, App } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";

let app: App;
let db: Firestore;

function getAdminApp(): App {
  if (getApps().length > 0) return getApps()[0];

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (serviceAccountJson) {
    const serviceAccount = JSON.parse(serviceAccountJson);
    app = initializeApp({ credential: cert(serviceAccount) });
  } else if (credentialsPath) {
    // Application Default Credentials / file path
    app = initializeApp();
  } else {
    throw new Error(
      "Firebase Admin not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS."
    );
  }

  return app;
}

export function getAdminDb(): Firestore {
  if (!db) {
    getAdminApp();
    db = getFirestore();
  }
  return db;
}
