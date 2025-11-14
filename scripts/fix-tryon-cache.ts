import postgres from 'postgres';
import * as dotenv from 'dotenv';

// Load DATABASE_URL from .env.local
dotenv.config({ path: '.env.local' });

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is not set');
  console.error('   Please set DATABASE_URL in .env.local');
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL);

async function fixTryOnCache() {
  try {
    console.log('🔧 Patching try_on_cache table...');

    // Add missing columns used by the app code / Drizzle schema
    await sql`
      ALTER TABLE "try_on_cache"
      ADD COLUMN IF NOT EXISTS "external_product_key" varchar(512),
      ADD COLUMN IF NOT EXISTS "model_version" varchar(128) NOT NULL DEFAULT 'gemini-2.5-flash-image',
      ADD COLUMN IF NOT EXISTS "params_hash" varchar(255) NOT NULL DEFAULT 'v1',
      ADD COLUMN IF NOT EXISTS "last_accessed_at" timestamp NOT NULL DEFAULT now(),
      ADD COLUMN IF NOT EXISTS "usage_count" integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "expires_at" timestamp NOT NULL DEFAULT (now() + interval '7 days');
    `;

    console.log('✅ Columns ensured on try_on_cache');

    // Ensure the unique index that matches Drizzle's uniqueUserPhotoProduct constraint
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS "try_on_cache_unique_user_photo_product"
      ON "try_on_cache" (
        "user_id",
        "photo_id",
        "product_id",
        "external_product_key",
        "model_version",
        "params_hash"
      );
    `;

    console.log('✅ Unique index ensured on try_on_cache_unique_user_photo_product');

    await sql.end();
    console.log('✨ try_on_cache patch complete');
  } catch (error) {
    console.error('❌ Error patching try_on_cache table:', error);
    await sql.end();
    process.exit(1);
  }
}

fixTryOnCache()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Unexpected error in fix-tryon-cache script:', error);
    process.exit(1);
  });
