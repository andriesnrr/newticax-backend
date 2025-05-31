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

export class EmailService {
  private static transporter: nodemailer.Transporter | null = null;
  private static isConfigured = false;

  // Initialize email transporter
  static initialize() {
    if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
      logger.warn('Email service not configured - SMTP settings missing');
      return;
    }

    try {
      this.transporter = nodemailer.createTransporter({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_PORT === 465, // true for 465, false for other ports
        auth: {
          user: env.SMTP_USER,
          pass: env.SMTP_PASS,
        },
        tls: {
          rejectUnauthorized: env.NODE_ENV === 'production',
        },
      });

      this.isConfigured = true;
      logger.info('Email service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize email service', { error });
    }
  }

  // Send email
  static async sendEmail(options: EmailOptions): Promise<boolean> {
    if (!this.isConfigured || !this.transporter) {
      logger.warn('Email service not configured, skipping email send');
      return false;
    }

    try {
      const mailOptions = {
        from: options.from || env.FROM_EMAIL,
        to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
      };

      const info = await this.transporter.sendMail(mailOptions);
      
      logger.info('Email sent successfully', {
        to: mailOptions.to,
        subject: options.subject,
        messageId: info.messageId,
      });

      return true;
    } catch (error) {
      logger.error('Failed to send email', {
        error,
        to: options.to,
        subject: options.subject,
      });
      return false;
    }
  }

  // Email templates
  private static getTemplate(type: string, data: any): EmailTemplate {
    const templates = {
      welcome: {
        subject: 'Welcome to NewticaX!',
        html: `
          <h1>Welcome to NewticaX, ${data.name}!</h1>
          <p>Thank you for joining our news platform. Start exploring the latest news and articles.</p>
          <p>Your username: <strong>${data.username}</strong></p>
          <p>If you have any questions, feel free to contact our support team.</p>
          <p>Best regards,<br>The NewticaX Team</p>
        `,
        text: `Welcome to NewticaX, ${data.name}! Thank you for joining our news platform. Your username: ${data.username}`,
      },
      
      passwordReset: {
        subject: 'Password Reset Request',
        html: `
          <h2>Password Reset Request</h2>
          <p>Hello ${data.name},</p>
          <p>You requested a password reset for your NewticaX account.</p>
          <p>Click the link below to reset your password:</p>
          <a href="${data.resetUrl}" style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Reset Password</a>
          <p>This link will expire in 1 hour.</p>
          <p>If you didn't request this, please ignore this email.</p>
          <p>Best regards,<br>The NewticaX Team</p>
        `,
        text: `Password reset requested for ${data.name}. Reset link: ${data.resetUrl} (expires in 1 hour)`,
      },

      newArticle: {
        subject: 'New Article Published',
        html: `
          <h2>New Article: ${data.title}</h2>
          <p>A new article has been published by ${data.authorName}:</p>
          <h3><a href="${data.articleUrl}">${data.title}</a></h3>
          <p>${data.summary}</p>
          <p><a href="${data.articleUrl}">Read Full Article</a></p>
          <p>Category: ${data.categoryName}</p>
          <p>Best regards,<br>The NewticaX Team</p>
        `,
        text: `New article: ${data.title} by ${data.authorName}. ${data.summary} Read more: ${data.articleUrl}`,
      },

      comment: {
        subject: 'New Comment on Your Article',
        html: `
          <h2>New Comment on "${data.articleTitle}"</h2>
          <p>Hello ${data.authorName},</p>
          <p>${data.commenterName} commented on your article:</p>
          <blockquote style="border-left: 4px solid #ccc; padding-left: 10px; margin: 10px 0;">
            ${data.commentContent}
          </blockquote>
          <p><a href="${data.articleUrl}#comment-${data.commentId}">View Comment</a></p>
          <p>Best regards,<br>The NewticaX Team</p>
        `,
        text: `${data.commenterName} commented on "${data.articleTitle}": ${data.commentContent}. View: ${data.articleUrl}`,
      },

      weeklyDigest: {
        subject: 'Your Weekly News Digest',
        html: `
          <h1>Your Weekly News Digest</h1>
          <p>Hello ${data.name},</p>
          <p>Here are the top articles from this week:</p>
          ${data.articles.map((article: any) => `
            <div style="border-bottom: 1px solid #eee; padding: 15px 0;">
              <h3><a href="${article.url}">${article.title}</a></h3>
              <p>${article.summary}</p>
              <small>By ${article.author} • ${article.date}</small>
            </div>
          `).join('')}
          <p><a href="${data.unsubscribeUrl}">Unsubscribe from weekly digest</a></p>
          <p>Best regards,<br>The NewticaX Team</p>
        `,
        text: `Weekly digest for ${data.name}. Top articles: ${data.articles.map((a: any) => a.title).join(', ')}`,
      },
    };

    return templates[type as keyof typeof templates] || templates.welcome;
  }

  // Send welcome email
  static async sendWelcomeEmail(userEmail: string, userData: any): Promise<boolean> {
    const template = this.getTemplate('welcome', userData);
    return await this.sendEmail({
      to: userEmail,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  // Send password reset email
  static async sendPasswordResetEmail(userEmail: string, resetData: any): Promise<boolean> {
    const template = this.getTemplate('passwordReset', resetData);
    return await this.sendEmail({
      to: userEmail,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  // Send new article notification
  static async sendNewArticleNotification(subscribers: string[], articleData: any): Promise<boolean> {
    const template = this.getTemplate('newArticle', articleData);
    return await this.sendEmail({
      to: subscribers,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  // Send comment notification
  static async sendCommentNotification(authorEmail: string, commentData: any): Promise<boolean> {
    const template = this.getTemplate('comment', commentData);
    return await this.sendEmail({
      to: authorEmail,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  // Send weekly digest
  static async sendWeeklyDigest(userEmail: string, digestData: any): Promise<boolean> {
    const template = this.getTemplate('weeklyDigest', digestData);
    return await this.sendEmail({
      to: userEmail,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  // Verify email configuration
  static async verifyConnection(): Promise<boolean> {
    if (!this.transporter) {
      return false;
    }

    try {
      await this.transporter.verify();
      logger.info('Email service connection verified');
      return true;
    } catch (error) {
      logger.error('Email service verification failed', { error });
      return false;
    }
  }
}

// Initialize email service
EmailService.initialize();