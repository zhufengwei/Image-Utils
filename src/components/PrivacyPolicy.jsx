import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, ArrowLeft, Lock } from 'lucide-react';

export default function PrivacyPolicy({ onManageAnalytics }) {
  useEffect(() => {
    document.title = 'Privacy Policy | Image Utility (100% Private)';
    window.scrollTo(0, 0);
  }, []);

  return (
    <article className="legal-page-container">
      <div className="legal-page-header">
        <Link to="/" className="legal-back-btn">
          <ArrowLeft size={16} />
          <span>Back to Tools</span>
        </Link>
        <div className="legal-badge">
          <ShieldCheck size={16} color="var(--color-success)" />
          <span>Zero Server Uploads Guaranteed</span>
        </div>
        <h1 className="legal-title">Privacy Policy</h1>
        <p className="legal-updated">Last updated: October 23, 2026</p>
      </div>

      <div className="legal-content">
        <section className="legal-card-highlight">
          <div className="legal-highlight-icon">
            <Lock size={24} color="var(--color-accent)" />
          </div>
          <div>
            <h3>The Core Privacy Guarantee</h3>
            <p>
              Image Utility operates <strong>entirely in your web browser</strong>. When you load, resize,
              compress, crop, or convert an image, the pixels are processed exclusively in your device's
              local RAM using HTML5 Canvas and JavaScript. Your files are <strong>never uploaded to any server,
              cloud service, or third-party storage</strong>.
            </p>
          </div>
        </section>

        <section className="legal-section">
          <h2>1. Data We Do Not Collect</h2>
          <p>Unlike traditional online image converters, Image Utility has no backend processing server. We do not collect, view, or retain:</p>
          <ul>
            <li><strong>Your Images:</strong> Photos, graphics, logos, or documents loaded into the app stay on your machine.</li>
            <li><strong>EXIF &amp; GPS Location Tags:</strong> Metadata embedded in your photos remains on your machine (or is scrubbed locally if you choose the Metadata tool).</li>
            <li><strong>Personally Identifiable Information (PII):</strong> We do not ask for your name, email address, phone number, or login credentials.</li>
            <li><strong>Uploaded Files:</strong> There is no file upload endpoint; network inspection (F12) confirms zero image payload transmissions.</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>2. How Local Processing Works</h2>
          <p>
            When you select or drop a file into Image Utility, your browser creates an ephemeral in-memory representation
            using standard Web APIs (such as <code>FileReader</code>, <code>HTMLCanvasElement</code>, and <code>OffscreenCanvas</code>).
            All calculations-downscaling, compression quantization, format encoding, and watermark rendering-occur directly
            via your computer or phone's CPU/GPU. Once you close the browser tab, the temporary memory is instantly reclaimed.
          </p>
        </section>

        <section className="legal-section">
          <h2>3. Optional Analytics</h2>
          <p>
            Google Analytics 4 is used to understand page visits and whether image tools are being used. The Google Analytics tag is loaded only after you choose “Allow analytics.” We send page paths and simple events such as opening a tool or loading an image. Image pixels, filenames, and EXIF metadata are never included in analytics events and remain on your device.
          </p>
          <p>
            If you allow analytics, Google may process browser and device information, referral information, and general location signals under its own policies. The site stores your analytics choice in this browser's local storage. If you reject on your first visit, the Google Analytics tag is not loaded. If you withdraw a previous choice, future events stop and the site attempts to remove Google Analytics cookies stored for this domain. You can change your choice at any time below.
          </p>
          <button type="button" className="analytics-consent-reject privacy-analytics-settings" onClick={onManageAnalytics}>
            Manage analytics preferences
          </button>
        </section>

        <section className="legal-section">
          <h2>4. Image Processing and Analytics Provider</h2>
          <p>
            Image processing remains entirely client-side and does not send image data to Image Utility or Google Analytics. When analytics is enabled by your choice, basic usage events are sent to Google Analytics 4. For details about Google's data handling, see Google's privacy information and Google Analytics terms.
          </p>
        </section>

        <section className="legal-section">
          <h2>5. Your Rights and Control</h2>
          <p>
            Because we do not collect or store your personal data on any server, there is no personal database from which to
            request data deletion or copies-you are always in total control of your media files on your local drive.
          </p>
        </section>

        <section className="legal-section">
          <h2>6. Contact Information</h2>
          <p>
            If you have questions about this Privacy Policy or our client-side architecture, contact the developer via{' '}
            <a href="https://h-arshal.github.io/Portfolio/" target="_blank" rel="noopener noreferrer">
              Harshal Moon's Portfolio
            </a>{' '}
            or view the open-source code on{' '}
            <a href="https://github.com/H-arshal/Image-Utils" target="_blank" rel="noopener noreferrer">
              GitHub
            </a>.
          </p>
        </section>
      </div>
    </article>
  );
}
