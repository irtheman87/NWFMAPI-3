import archiver from 'archiver';
import fs from 'fs';
import path from 'path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export const zipAndUploadFiles = async (files: Express.Multer.File[]): Promise<string | null> => {
  if (files.length === 0) return null;

  const zipFolderName = path.parse(files[0].originalname).name;
  const zipFilePath = path.join(__dirname, `../uploads/${zipFolderName}.zip`);

  try {
    const output = fs.createWriteStream(zipFilePath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.pipe(output);

    for (const file of files) {
      try {
        archive.file(file.path, { name: file.originalname });
      } catch (err) {
        console.error(`❌ Error adding file "${file.originalname}" to archive:`, err);
      }
    }

    try {
      await archive.finalize();
    } catch (err) {
      console.error(`❌ Error finalizing archive:`, err);
      throw err;
    }

    try {
      await new Promise((resolve, reject) => {
        output.on('close', resolve);
        output.on('error', (err) => {
          console.error(`❌ Error writing zip file to disk:`, err);
          reject(err);
        });
        archive.on('error', (err) => {
          console.error(`❌ Archive error:`, err);
          reject(err);
        });
      });
    } catch (err) {
      console.error(`❌ Error during archive writing process:`, err);
      throw err;
    }

    let zipFileBuffer: Buffer;
    try {
      zipFileBuffer = fs.readFileSync(zipFilePath);
    } catch (err) {
      console.error(`❌ Error reading zip file from disk: ${zipFilePath}`, err);
      throw err;
    }

    const key = `zipped/${Date.now()}-${zipFolderName}.zip`;

    try {
      await s3.send(
        new PutObjectCommand({
          Bucket: process.env.AWS_S3_BUCKET_NAME!,
          Key: key,
          Body: zipFileBuffer,
          ContentType: 'application/zip',
        })
      );
    } catch (err) {
      console.error(`❌ Error uploading zip to S3:`, err);
      throw err;
    }

    // Clean up local files
    for (const file of files) {
      try {
        fs.unlinkSync(file.path);
      } catch (err) {
        console.error(`⚠️ Error deleting file: ${file.path}`, err);
      }
    }

    try {
      fs.unlinkSync(zipFilePath);
    } catch (err) {
      console.error(`⚠️ Error deleting zip file: ${zipFilePath}`, err);
    }

    return `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
  } catch (err) {
    console.error(`❌ zipAndUploadFiles failed completely:`, err);
    return null;
  }
};
