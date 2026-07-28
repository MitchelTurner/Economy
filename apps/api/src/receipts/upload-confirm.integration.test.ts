/**
 * Integration: register (with image bytes) → mock extract → confirm
 * against the live Postgres used in this environment.
 */
import { createHash, randomUUID } from 'crypto';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { PrismaClient, ReceiptStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ExtractionProvider } from '../extraction/extraction.provider';
import { ExtractionService } from '../extraction/extraction.service';
import { ReceiptsService } from './receipts.service';
import { CatalogService } from '../catalog/catalog.service';
import { AuthUser } from '../common/decorators/current-user.decorator';

const runIntegration = process.env.SKIP_INTEGRATION !== '1';

describe.runIf(runIntegration)('upload → extract → confirm', () => {
  const prisma = new PrismaClient();
  let user: AuthUser;
  let householdId: string;
  let extraction: ExtractionService;
  let receipts: ReceiptsService;
  let storage: StorageService;

  beforeAll(async () => {
    const suffix = randomUUID().slice(0, 8);
    const household = await prisma.household.create({
      data: { name: `Integration ${suffix}` },
    });
    householdId = household.id;
    const dbUser = await prisma.user.create({
      data: {
        email: `int-${suffix}@islandledger.test`,
        passwordHash: await argon2.hash('test-password'),
        displayName: 'Integration',
        role: 'owner',
        householdId,
      },
    });
    user = {
      userId: dbUser.id,
      householdId,
      email: dbUser.email,
      role: dbUser.role,
    };

    const config = new ConfigService({
      EXTRACTION_PROVIDER: 'mock',
      ALLOW_MOCK_EXTRACTION: 'true',
      MAX_EXTRACTIONS_PER_DAY: '50',
      S3_ENDPOINT: 'http://127.0.0.1:9',
      S3_BUCKET: 'test',
      S3_ACCESS_KEY_ID: 'x',
      S3_SECRET_ACCESS_KEY: 'y',
    });
    storage = new StorageService(config);
    const provider = new ExtractionProvider(config);
    const matchQueue = { add: vi.fn().mockResolvedValue({}) } as never;
    const extractQueue = { add: vi.fn().mockResolvedValue({}) } as never;
    const observeQueue = { add: vi.fn().mockResolvedValue({}) } as never;
    const insightsQueue = { add: vi.fn().mockResolvedValue({}) } as never;

    extraction = new ExtractionService(
      prisma as unknown as PrismaService,
      storage,
      provider,
      config,
      matchQueue,
    );

    const catalog = {
      matchReceipt: vi.fn().mockResolvedValue({ matched: 0 }),
      applyCategoryToSimilar: vi.fn(),
    } as unknown as CatalogService;

    receipts = new ReceiptsService(
      prisma as unknown as PrismaService,
      storage,
      catalog,
      extractQueue,
      matchQueue,
      observeQueue,
      insightsQueue,
    );
  }, 30_000);

  it('produces a CONFIRMED receipt with arithmetic-ok lines from mock extract', async () => {
    const imageKey = storage.newImageKey(householdId, 'jpg');
    const bytes = Buffer.from('integration-receipt-bytes');
    const imageHash = createHash('sha256').update(bytes).digest('hex');

    const registered = await receipts.register(user, {
      imageKey,
      imageHash,
      imageBase64: bytes.toString('base64'),
    });
    expect(registered.deduped).toBe(false);

    await extraction.processReceipt(registered.receiptId);

    const afterExtract = await prisma.receipt.findUnique({
      where: { id: registered.receiptId },
      include: { lines: true },
    });
    expect(afterExtract?.status).toBe(ReceiptStatus.NEEDS_REVIEW);
    expect(afterExtract?.arithmeticOk).toBe(true);
    expect(afterExtract?.lines.length).toBeGreaterThanOrEqual(3);
    expect(afterExtract?.totalCents).toBe(1147);

    const confirmed = await receipts.confirm(user, registered.receiptId, {
      overrideArithmetic: false,
    });
    expect(confirmed.status).toBe(ReceiptStatus.CONFIRMED);

    // Cleanup fixture household (relations without cascade)
    await prisma.extractionUsage.deleteMany({ where: { householdId } });
    await prisma.insight.deleteMany({ where: { householdId } });
    await prisma.priceObservation.deleteMany({ where: { householdId } });
    await prisma.receipt.deleteMany({ where: { householdId } });
    await prisma.budget.deleteMany({ where: { householdId } });
    await prisma.user.deleteMany({ where: { householdId } });
    await prisma.household.delete({ where: { id: householdId } });
    await prisma.$disconnect();
  }, 60_000);
});
