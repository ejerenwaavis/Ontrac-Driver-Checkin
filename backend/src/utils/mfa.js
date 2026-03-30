import { authenticator } from 'otplib';
import QRCode from 'qrcode';

const APP_NAME = 'OnTrac Driver Check-In';

/**
 * Generate a new TOTP secret.
 */
export const generateSecret = () => authenticator.generateSecret(20);

/**
 * Generate the otpauth:// URI for QR code rendering.
 */
export const generateOtpUri = (secret, userEmail) => {
  return authenticator.keyuri(userEmail, APP_NAME, secret);
};

/**
 * Generate a base64 data URL PNG QR code from a TOTP URI.
 */
export const generateQRCodeDataUrl = async (otpUri) => {
  return QRCode.toDataURL(otpUri, {
    errorCorrectionLevel: 'H',
    width: 256,
    margin: 2,
  });
};

/**
 * Verify a TOTP token against a secret.
 * Window of ±1 step (30s) to allow for minor clock drift.
 */
export const verifyTotp = (token, secret) => {
  authenticator.options = { window: 1 };
  return authenticator.verify({ token, secret });
};
