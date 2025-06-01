import nodemailer from 'nodemailer';
import { env } from '../config/env';
import { logger } from '../utils/logger';

interface EmailOptions {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  from?: string;
}

interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

interface ArticleData {
  title: string;
  authorName: string;
  articleUrl: string;
  summary: string;
  categoryName: string;
}

interface CommentData {
  articleTitle: string;
  authorName: string;
  commenterName: string;
  commentContent: string;
  articleUrl: string;
  commentId: string;
}

interface UserData {
  name: string;
  username: string;
  email?: string;
}

interface ResetData {
  name: string;
  resetUrl: string;
}

interface DigestData {
  name: string;
  articles: Array<{
    title: string;
    url: string;
    summary: string;
    author: string;
    date: string;
  }>;
  unsubscribeUrl: string;
}

export class EmailService {
  private static transporter: nodemailer.Transporter | null = null;
  private static isConfigured = false;

  // Initialize email transporter
  static initialize(): void {
    // Check if all required SMTP settings are available
    if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
      logger.warn('Email service not configured - SMTP settings missing', {
        hasHost: !!env.SMTP_HOST,
        hasUser: !!env.SMTP_USER,
        hasPass: !!env.SMTP_PASS,
      });
      this.isConfigured = false;
      return;
    }

    try {
      // Create nodemailer transporter
      this.transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_PORT === 465, // true for 465 (SSL), false for other ports (TLS)
        auth: {
          user: env.SMTP_USER,
          pass: env.SMTP_PASS,
        },
        tls: {
          rejectUnauthorized: env.NODE_ENV === 'production',
        },
        // Additional options for better reliability
        connectionTimeout: 10000, // 10 seconds
        greetingTimeout: 5000,    // 5 seconds
        socketTimeout: 10000,     // 10 seconds
      });

      this.isConfigured = true;
      logger.info('Email service initialized successfully', {
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        user: env.SMTP_USER,
      });
    } catch (error) {
      this.isConfigured = false;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to initialize email service', { 
        error: errorMessage,
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
      });
    }
  }

  // Check if email service is configured and ready
  static isReady(): boolean {
    return this.isConfigured && this.transporter !== null;
  }

  // Send email
  static async sendEmail(options: EmailOptions): Promise<boolean> {
    if (!this.isReady()) {
      logger.warn('Email service not configured, skipping email send', {
        to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
        subject: options.subject,
      });
      return false;
    }

    try {
      const mailOptions: nodemailer.SendMailOptions = {
        from: options.from || env.FROM_EMAIL || env.SMTP_USER,
        to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
      };

      const info = await this.transporter!.sendMail(mailOptions);
      
      logger.info('Email sent successfully', {
        to: mailOptions.to,
        subject: options.subject,
        messageId: info.messageId,
        response: info.response,
      });

      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to send email', {
        error: errorMessage,
        to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
        subject: options.subject,
      });
      return false;
    }
  }

  // Email templates
  private static getTemplate(type: string, data: any): EmailTemplate {
    const baseStyle = `
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #007bff; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background: #f9f9f9; }
        .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
        .button { display: inline-block; background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin: 10px 0; }
        .article { border-bottom: 1px solid #eee; padding: 15px 0; }
        blockquote { border-left: 4px solid #007bff; padding-left: 15px; margin: 15px 0; font-style: italic; background: #f8f9fa; padding: 15px; }
      </style>
    `;

    const templates: Record<string, EmailTemplate> = {
      welcome: {
        subject: 'Welcome to NewticaX!',
        html: `
          ${baseStyle}
          <div class="container">
            <div class="header">
              <h1>Welcome to NewticaX!</h1>
            </div>
            <div class="content">
              <h2>Hello ${data.name}!</h2>
              <p>Thank you for joining our news platform. We're excited to have you as part of our community!</p>
              <p><strong>Your account details:</strong></p>
              <ul>
                <li>Username: <strong>${data.username}</strong></li>
                <li>Email: <strong>${data.email || 'Not provided'}</strong></li>
              </ul>
              <p>You can now:</p>
              <ul>
                <li>📰 Read the latest news articles</li>
                <li>💾 Bookmark your favorite articles</li>
                <li>💬 Comment on articles</li>
                <li>⚙️ Customize your news preferences</li>
              </ul>
              <a href="${env.FRONTEND_URL || 'http://localhost:3000'}" class="button">Start Reading News</a>
            </div>
            <div class="footer">
              <p>If you have any questions, feel free to contact our support team.</p>
              <p>Best regards,<br><strong>The NewticaX Team</strong></p>
            </div>
          </div>
        `,
        text: `Welcome to NewticaX, ${data.name}! Thank you for joining our news platform. Your username: ${data.username}. Start reading news at ${env.FRONTEND_URL || 'http://localhost:3000'}`,
      },
      
      passwordReset: {
        subject: 'Password Reset Request - NewticaX',
        html: `
          ${baseStyle}
          <div class="container">
            <div class="header">
              <h1>Password Reset Request</h1>
            </div>
            <div class="content">
              <h2>Hello ${data.name},</h2>
              <p>You requested a password reset for your NewticaX account.</p>
              <p>Click the button below to reset your password:</p>
              <a href="${data.resetUrl}" class="button">Reset Password</a>
              <p><strong>Important:</strong></p>
              <ul>
                <li>This link will expire in 1 hour</li>
                <li>If you didn't request this reset, please ignore this email</li>
                <li>Your current password remains unchanged until you create a new one</li>
              </ul>
              <p>If the button doesn't work, copy and paste this link into your browser:</p>
              <p><a href="${data.resetUrl}">${data.resetUrl}</a></p>
            </div>
            <div class="footer">
              <p>If you need help, contact our support team.</p>
              <p>Best regards,<br><strong>The NewticaX Team</strong></p>
            </div>
          </div>
        `,
        text: `Password reset requested for ${data.name}. Reset link: ${data.resetUrl} (expires in 1 hour). If you didn't request this, please ignore this email.`,
      },

      newArticle: {
        subject: `New Article: ${data.title}`,
        html: `
          ${baseStyle}
          <div class="container">
            <div class="header">
              <h1>New Article Published</h1>
            </div>
            <div class="content">
              <h2>${data.title}</h2>
              <p>A new article has been published by <strong>${data.authorName}</strong>:</p>
              <div class="article">
                <h3><a href="${data.articleUrl}" style="color: #007bff; text-decoration: none;">${data.title}</a></h3>
                <p>${data.summary}</p>
                <p><strong>Category:</strong> ${data.categoryName}</p>
                <a href="${data.articleUrl}" class="button">Read Full Article</a>
              </div>
            </div>
            <div class="footer">
              <p>Stay updated with the latest news on NewticaX!</p>
              <p>Best regards,<br><strong>The NewticaX Team</strong></p>
            </div>
          </div>
        `,
        text: `New article: "${data.title}" by ${data.authorName}. ${data.summary} Category: ${data.categoryName}. Read more: ${data.articleUrl}`,
      },

      comment: {
        subject: `New Comment on "${data.articleTitle}"`,
        html: `
          ${baseStyle}
          <div class="container">
            <div class="header">
              <h1>New Comment on Your Article</h1>
            </div>
            <div class="content">
              <h2>Hello ${data.authorName},</h2>
              <p><strong>${data.commenterName}</strong> commented on your article "<strong>${data.articleTitle}</strong>":</p>
              <blockquote>${data.commentContent}</blockquote>
              <a href="${data.articleUrl}#comment-${data.commentId}" class="button">View Comment</a>
              <p>You can reply to this comment directly on the article page.</p>
            </div>
            <div class="footer">
              <p>Keep the conversation going on NewticaX!</p>
              <p>Best regards,<br><strong>The NewticaX Team</strong></p>
            </div>
          </div>
        `,
        text: `${data.commenterName} commented on "${data.articleTitle}": "${data.commentContent}". View: ${data.articleUrl}#comment-${data.commentId}`,
      },

      weeklyDigest: {
        subject: 'Your Weekly News Digest',
        html: `
          ${baseStyle}
          <div class="container">
            <div class="header">
              <h1>Your Weekly News Digest</h1>
            </div>
            <div class="content">
              <h2>Hello ${data.name},</h2>
              <p>Here are the top articles from this week that you might find interesting:</p>
              ${data.articles.map((article: any) => `
                <div class="article">
                  <h3><a href="${article.url}" style="color: #007bff; text-decoration: none;">${article.title}</a></h3>
                  <p>${article.summary}</p>
                  <small style="color: #666;">By ${article.author} • ${article.date}</small>
                </div>
              `).join('')}
              <a href="${env.FRONTEND_URL || 'http://localhost:3000'}" class="button">Read More Articles</a>
            </div>
            <div class="footer">
              <p><a href="${data.unsubscribeUrl}" style="color: #666;">Unsubscribe from weekly digest</a></p>
              <p>Best regards,<br><strong>The NewticaX Team</strong></p>
            </div>
          </div>
        `,
        text: `Weekly digest for ${data.name}. Top articles: ${data.articles.map((a: any) => a.title).join(', ')}. Read more at ${env.FRONTEND_URL}`,
      },
    };

    return templates[type] || templates.welcome;
  }

  // Send welcome email
  static async sendWelcomeEmail(userEmail: string, userData: UserData): Promise<boolean> {
    const template = this.getTemplate('welcome', userData);
    return await this.sendEmail({
      to: userEmail,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  // Send password reset email
  static async sendPasswordResetEmail(userEmail: string, resetData: ResetData): Promise<boolean> {
    const template = this.getTemplate('passwordReset', resetData);
    return await this.sendEmail({
      to: userEmail,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  // Send new article notification
  static async sendNewArticleNotification(subscribers: string[], articleData: ArticleData): Promise<boolean> {
    if (!Array.isArray(subscribers) || subscribers.length === 0) {
      logger.warn('No subscribers provided for new article notification');
      return false;
    }

    const template = this.getTemplate('newArticle', articleData);
    return await this.sendEmail({
      to: subscribers,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  // Send comment notification
  static async sendCommentNotification(authorEmail: string, commentData: CommentData): Promise<boolean> {
    const template = this.getTemplate('comment', commentData);
    return await this.sendEmail({
      to: authorEmail,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  // Send weekly digest
  static async sendWeeklyDigest(userEmail: string, digestData: DigestData): Promise<boolean> {
    const template = this.getTemplate('weeklyDigest', digestData);
    return await this.sendEmail({
      to: userEmail,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  // Send bulk emails (with rate limiting)
  static async sendBulkEmails(
    emails: Array<{ to: string; data: any }>,
    templateType: string,
    batchSize: number = 10,
    delayMs: number = 1000
  ): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    // Process emails in batches to avoid rate limiting
    for (let i = 0; i < emails.length; i += batchSize) {
      const batch = emails.slice(i, i + batchSize);
      
      await Promise.allSettled(
        batch.map(async (emailData) => {
          try {
            const template = this.getTemplate(templateType, emailData.data);
            const result = await this.sendEmail({
              to: emailData.to,
              subject: template.subject,
              html: template.html,
              text: template.text,
            });
            
            if (result) {
              success++;
            } else {
              failed++;
            }
          } catch (error) {
            failed++;
            logger.error('Bulk email send error', { 
              error, 
              to: emailData.to,
              template: templateType,
            });
          }
        })
      );

      // Add delay between batches
      if (i + batchSize < emails.length) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    logger.info('Bulk email send completed', {
      total: emails.length,
      success,
      failed,
      template: templateType,
    });

    return { success, failed };
  }

  // Verify email configuration
  static async verifyConnection(): Promise<boolean> {
    if (!this.isReady()) {
      logger.warn('Email service not configured for verification');
      return false;
    }

    try {
      await this.transporter!.verify();
      logger.info('Email service connection verified successfully');
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Email service verification failed', { error: errorMessage });
      return false;
    }
  }

  // Get email service status
  static getStatus(): { configured: boolean; verified?: boolean } {
    return {
      configured: this.isConfigured,
      // Add verification status if needed
    };
  }

  // Close transporter connection
  static async close(): Promise<void> {
    if (this.transporter) {
      try {
        this.transporter.close();
        this.transporter = null;
        this.isConfigured = false;
        logger.info('Email service connection closed');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Error closing email service connection', { error: errorMessage });
      }
    }
  }
}

// Initialize email service when module is loaded
EmailService.initialize();