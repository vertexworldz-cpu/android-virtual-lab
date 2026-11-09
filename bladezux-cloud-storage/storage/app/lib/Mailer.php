<?php
declare(strict_types=1);

namespace Bladezux;

use PHPMailer\PHPMailer\Exception as MailException;
use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\SMTP;

/**
 * Branded transactional email over the cPanel mailbox (SMTP via PHPMailer).
 * SMTP credentials are only ever read server-side from encrypted settings.
 */
final class Mailer
{
    public static function isConfigured(): bool
    {
        return Settings::get('smtp_host', '') !== '' && Settings::get('smtp_from_email', '') !== '';
    }

    /**
     * @param array{title:string, greeting?:string, lines:string[], button?:array{label:string,url:string}, footnote?:string} $content
     * @return array{ok:bool, error?:string}
     */
    public static function send(string $toEmail, string $toName, string $subject, array $content): array
    {
        if (!self::isConfigured()) {
            Logger::warning("Email '$subject' not sent: SMTP is not configured.");
            return ['ok' => false, 'error' => 'Email delivery is not configured. Ask the owner to configure SMTP in Settings → Email.'];
        }
        $mail = self::build();
        try {
            $mail->addAddress($toEmail, $toName);
            $mail->Subject = $subject;
            $mail->isHTML(true);
            $mail->Body = self::renderHtml($content);
            $mail->AltBody = self::renderText($content);
            $mail->send();
            return ['ok' => true];
        } catch (MailException $e) {
            Logger::error('SMTP send failed: ' . $mail->ErrorInfo);
            return ['ok' => false, 'error' => self::friendlyError($mail->ErrorInfo)];
        }
    }

    private static function build(): PHPMailer
    {
        $mail = new PHPMailer(true);
        $mail->isSMTP();
        $mail->Host = (string) Settings::get('smtp_host');
        $mail->Port = (int) Settings::get('smtp_port', '465');
        $encryption = Settings::get('smtp_encryption', 'ssl');
        $mail->SMTPSecure = match ($encryption) {
            'ssl' => PHPMailer::ENCRYPTION_SMTPS,
            'tls' => PHPMailer::ENCRYPTION_STARTTLS,
            default => '',
        };
        $mail->SMTPAutoTLS = $encryption !== 'none';
        $username = (string) Settings::get('smtp_username', '');
        if ($username !== '') {
            $mail->SMTPAuth = true;
            $mail->Username = $username;
            $mail->Password = (string) Settings::get('smtp_password', '');
        }
        $mail->Timeout = 20;
        $mail->CharSet = PHPMailer::CHARSET_UTF8;
        $mail->SMTPDebug = SMTP::DEBUG_OFF;
        $mail->setFrom((string) Settings::get('smtp_from_email'), (string) (Settings::get('smtp_from_name') ?: Settings::appName()));
        $mail->XMailer = ' ';
        return $mail;
    }

    private static function friendlyError(string $info): string
    {
        $lower = strtolower($info);
        return match (true) {
            str_contains($lower, 'authenticate') => 'SMTP authentication failed. Check the SMTP username and password.',
            str_contains($lower, 'connect') => 'Could not connect to the SMTP server. Check the host, port and encryption settings.',
            str_contains($lower, 'recipient') => 'The recipient address was rejected by the mail server.',
            default => 'The email could not be sent. Check the SMTP settings and the error log.',
        };
    }

    private static function renderHtml(array $c): string
    {
        $app = e(Settings::appName());
        $title = e($c['title']);
        $greeting = isset($c['greeting']) ? '<p style="margin:0 0 16px;font-size:15px;color:#111827;">' . e($c['greeting']) . '</p>' : '';
        $lines = '';
        foreach ($c['lines'] as $line) {
            $lines .= '<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334155;">' . e($line) . '</p>';
        }
        $button = '';
        if (!empty($c['button'])) {
            $href = e($c['button']['url']);
            $button = '<table role="presentation" cellspacing="0" cellpadding="0" style="margin:8px 0 24px;"><tr><td style="border-radius:8px;background:#4338CA;">'
                . '<a href="' . $href . '" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">'
                . e($c['button']['label']) . '</a></td></tr></table>'
                . '<p style="margin:0 0 16px;font-size:13px;color:#64748B;">If the button does not work, copy this link into your browser:<br><span style="word-break:break-all;color:#4338CA;">' . $href . '</span></p>';
        }
        $foot = isset($c['footnote']) ? '<p style="margin:16px 0 0;font-size:13px;color:#64748B;">' . e($c['footnote']) . '</p>' : '';
        $year = date('Y');
        return <<<HTML
<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>$title</title></head>
<body style="margin:0;padding:0;background:#F7F8FC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F7F8FC;padding:32px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;">
<tr><td style="padding:0 4px 20px;font-size:13px;font-weight:700;letter-spacing:.18em;color:#111827;">BLADEZUX<span style="color:#7C3AED;"> ·</span> <span style="font-weight:500;letter-spacing:.02em;color:#64748B;">Cloud Storage</span></td></tr>
<tr><td style="background:#ffffff;border:1px solid #E5E7EB;border-radius:14px;padding:32px;">
<h1 style="margin:0 0 20px;font-size:20px;line-height:1.3;color:#111827;">$title</h1>
$greeting$lines$button$foot
</td></tr>
<tr><td style="padding:20px 4px;font-size:12px;color:#94A3B8;">This is an automated security message from $app. Please do not reply. &copy; $year Bladezux.</td></tr>
</table></td></tr></table></body></html>
HTML;
    }

    private static function renderText(array $c): string
    {
        $text = $c['title'] . "\n\n";
        if (isset($c['greeting'])) {
            $text .= $c['greeting'] . "\n\n";
        }
        foreach ($c['lines'] as $line) {
            $text .= $line . "\n\n";
        }
        if (!empty($c['button'])) {
            $text .= $c['button']['label'] . ': ' . $c['button']['url'] . "\n\n";
        }
        if (isset($c['footnote'])) {
            $text .= $c['footnote'] . "\n";
        }
        return $text . "\n— " . Settings::appName();
    }

    // ---------------------------------------------------------------- templates

    public static function passwordReset(array $admin, string $link): array
    {
        return self::send($admin['email'], $admin['name'], 'Reset your ' . Settings::appName() . ' password', [
            'title' => 'Reset your password',
            'greeting' => 'Hi ' . $admin['name'] . ',',
            'lines' => [
                'We received a request to reset the password for your account. Use the button below to choose a new password.',
                'This link expires in 30 minutes and can only be used once.',
            ],
            'button' => ['label' => 'Reset password', 'url' => $link],
            'footnote' => 'If you did not request a password reset, you can safely ignore this email — your password will not change. Request IP: ' . Http::ip(),
        ]);
    }

    public static function invitation(array $admin, string $inviterName, string $link): array
    {
        return self::send($admin['email'], $admin['name'], 'You have been invited to ' . Settings::appName(), [
            'title' => 'Your account is ready',
            'greeting' => 'Hi ' . $admin['name'] . ',',
            'lines' => [
                $inviterName . ' created an administrator account for you on ' . Settings::appName() . '.',
                'Set your password to activate the account. This invitation link expires in 48 hours.',
            ],
            'button' => ['label' => 'Activate account', 'url' => $link],
            'footnote' => 'If you were not expecting this invitation, you can ignore this email.',
        ]);
    }

    public static function accountCreated(array $admin, string $inviterName): array
    {
        return self::send($admin['email'], $admin['name'], 'Your ' . Settings::appName() . ' account', [
            'title' => 'Your account has been created',
            'greeting' => 'Hi ' . $admin['name'] . ',',
            'lines' => [
                $inviterName . ' created an administrator account for you. The workspace owner will share your initial password with you through a secure channel.',
                'For security, change your password after your first sign-in (Settings → Account).',
            ],
            'button' => ['label' => 'Sign in', 'url' => url('login.php', true)],
        ]);
    }

    public static function securityNotice(array $admin, string $title, string $message): array
    {
        return self::send($admin['email'], $admin['name'], 'Security notice: ' . $title, [
            'title' => $title,
            'greeting' => 'Hi ' . $admin['name'] . ',',
            'lines' => [$message, 'Time: ' . gmdate('Y-m-d H:i') . ' UTC · IP address: ' . Http::ip()],
            'footnote' => 'If this was not you, contact the workspace owner immediately and reset your password.',
        ]);
    }

    public static function test(string $toEmail, string $toName): array
    {
        return self::send($toEmail, $toName, 'Test email from ' . Settings::appName(), [
            'title' => 'SMTP is working',
            'greeting' => 'Hi ' . $toName . ',',
            'lines' => ['This test message confirms that ' . Settings::appName() . ' can deliver email through your cPanel mailbox.'],
        ]);
    }
}
