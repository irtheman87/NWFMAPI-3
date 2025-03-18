import multer from 'multer';
import path from 'path';
import fs from 'fs';
import multerS3 from 'multer-s3';
import { S3Client } from '@aws-sdk/client-s3';

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

// ============ Local Storage for 'files' ============
const expectedLocalFields = ['files'];

const localStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  },
});

// Logging fileFilter to debug unexpected fields
const localFileFilter: multer.Options['fileFilter'] = (req, file, cb) => {
  if (!expectedLocalFields.includes(file.fieldname)) {
    console.warn(
      `[LOCAL UPLOAD] ⚠ Unexpected field received: "${file.fieldname}". Expected fields: [${expectedLocalFields.join(', ')}]`
    );
    return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname));
  }
  cb(null, true);
};

export const uploadLocalFiles = multer({
  storage: localStorage,
  fileFilter: localFileFilter,
}).fields([{ name: 'files', maxCount: 10 }]);

// ============ S3 Upload for characterbible & keyart ============
const expectedS3Fields = ['characterbible', 'keyart'];

const s3Storage = multerS3({
  s3: s3,
  bucket: process.env.AWS_S3_BUCKET_NAME || '',
  metadata: (req, file, cb) => {
    cb(null, { fieldName: file.fieldname });
  },
  key: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  },
});

const s3FileFilter: multer.Options['fileFilter'] = (req, file, cb) => {
  if (!expectedS3Fields.includes(file.fieldname)) {
    console.warn(
      `[S3 UPLOAD] ⚠ Unexpected field received: "${file.fieldname}". Expected fields: [${expectedS3Fields.join(', ')}]`
    );
    return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname));
  }
  cb(null, true);
};

export const uploadCharacterBible = multer({
  storage: s3Storage,
  fileFilter: s3FileFilter,
}).fields([
  { name: 'characterbible', maxCount: 1 },
  { name: 'keyart', maxCount: 10 },
]);
