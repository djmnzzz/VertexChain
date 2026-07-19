import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLineageColumn1700000000002 implements MigrationInterface {
  name = 'AddLineageColumn1700000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Author identity — required to authorize future edits to a gist.
    // Nullable: gists posted without an author remain permanently anonymous
    // and therefore uneditable (no identity to verify a PATCH against).
    await queryRunner.query(`
      ALTER TABLE "gists"
        ADD COLUMN IF NOT EXISTS "author" VARCHAR(80)
    `);

    // Lineage — the content_hash (IPFS CID) that was replaced by the
    // current content_hash, plus when that replacement happened.
    await queryRunner.query(`
      ALTER TABLE "gists"
        ADD COLUMN IF NOT EXISTS "previous_cid" VARCHAR(100)
    `);

    await queryRunner.query(`
      ALTER TABLE "gists"
        ADD COLUMN IF NOT EXISTS "edited_at" TIMESTAMPTZ
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "gists" DROP COLUMN IF EXISTS "edited_at"`);
    await queryRunner.query(`ALTER TABLE "gists" DROP COLUMN IF EXISTS "previous_cid"`);
    await queryRunner.query(`ALTER TABLE "gists" DROP COLUMN IF EXISTS "author"`);
  }
}
