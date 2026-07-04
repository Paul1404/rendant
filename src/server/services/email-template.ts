// Bulletproof HTML email templates. Built table-first with inline styles so they
// survive Gmail (which strips <head> styles and <style> classes) and Outlook on
// Windows (Word rendering engine: no border-radius, no fl-box, VML for buttons).
// Every send also ships a plain-text part as the true fallback.

const BRAND = {
	green: "#0F4435",
	brass: "#C49A4E",
	ink: "#13201B",
	muted: "#5b6660",
	page: "#eceadf",
	card: "#ffffff",
	softBg: "#f6f3ec",
	border: "#e4dfd2",
	white: "#ffffff",
};

const FONT =
	"Arial, 'Helvetica Neue', Helvetica, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

export function escapeHtml(input: string): string {
	return input
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

// A bulletproof CTA button: VML for Outlook, a padded anchor for everyone else.
function button(url: string, label: string): string {
	const href = escapeHtml(url);
	const text = escapeHtml(label);
	return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px auto 0;">
  <tr>
    <td align="center" bgcolor="${BRAND.green}" style="border-radius:8px;">
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:46px;v-text-anchor:middle;width:260px;" arcsize="16%" strokecolor="${BRAND.green}" fillcolor="${BRAND.green}">
        <w:anchorlock/>
        <center style="color:#ffffff;font-family:${FONT};font-size:15px;font-weight:bold;">${text}</center>
      </v:roundrect>
      <![endif]-->
      <!--[if !mso]><!-- -->
      <a href="${href}" target="_blank" style="background-color:${BRAND.green};border:1px solid ${BRAND.green};border-radius:8px;color:#ffffff;display:inline-block;font-family:${FONT};font-size:15px;font-weight:bold;line-height:20px;padding:13px 30px;text-align:center;text-decoration:none;">${text}</a>
      <!--<![endif]-->
    </td>
  </tr>
</table>`;
}

export function paragraph(html: string): string {
	return `<p style="margin:0 0 16px;color:${BRAND.ink};font-family:${FONT};font-size:15px;line-height:23px;">${html}</p>`;
}

// A label/value details table (no monetary values ever go in here).
export function detailsTable(rows: Array<[string, string]>): string {
	const body = rows
		.map(([label, value], i) => {
			const border = i === 0 ? "none" : `1px solid ${BRAND.border}`;
			return `
    <tr>
      <td style="border-top:${border};padding:10px 0;color:${BRAND.muted};font-family:${FONT};font-size:13px;line-height:18px;white-space:nowrap;vertical-align:top;">${escapeHtml(label)}</td>
      <td style="border-top:${border};padding:10px 0 10px 16px;color:${BRAND.ink};font-family:${FONT};font-size:14px;line-height:18px;font-weight:bold;text-align:right;vertical-align:top;">${escapeHtml(value)}</td>
    </tr>`;
		})
		.join("");
	return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;margin:0 0 20px;border:1px solid ${BRAND.border};border-radius:10px;background-color:${BRAND.softBg};">
  <tr><td style="padding:6px 18px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;">${body}
    </table>
  </td></tr>
</table>`;
}

// A soft callout box used to explain why the mail carries no amounts.
export function callout(title: string, body: string): string {
	return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;margin:0 0 20px;background-color:${BRAND.softBg};border:1px solid ${BRAND.border};border-radius:10px;">
  <tr>
    <td width="4" style="width:4px;background-color:${BRAND.brass};border-radius:10px 0 0 10px;font-size:0;line-height:0;">&nbsp;</td>
    <td style="padding:14px 18px;">
      <p style="margin:0 0 6px;color:${BRAND.ink};font-family:${FONT};font-size:13px;font-weight:bold;line-height:18px;">${escapeHtml(title)}</p>
      <p style="margin:0;color:${BRAND.muted};font-family:${FONT};font-size:13px;line-height:19px;">${body}</p>
    </td>
  </tr>
</table>`;
}

export function ctaBlock(url: string, label: string, note?: string): string {
	const noteHtml = note
		? `<p style="margin:12px 0 0;color:${BRAND.muted};font-family:${FONT};font-size:12px;line-height:17px;text-align:center;">${escapeHtml(note)}</p>`
		: "";
	return `<div style="margin:0 0 8px;">${button(url, label)}${noteHtml}</div>`;
}

type ShellOptions = {
	preheader: string;
	eyebrow: string;
	heading: string;
	blocks: string[];
	verein: string;
};

// Wraps content blocks in the branded, centered 600px shell.
export function emailShell(opts: ShellOptions): string {
	const { preheader, eyebrow, heading, blocks, verein } = opts;
	const year = new Date().getFullYear();
	return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="de">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<meta name="color-scheme" content="light only" />
<meta name="supported-color-schemes" content="light" />
<title>SVUFO</title>
<!--[if mso]>
<style type="text/css">table,td,div,p,a{font-family:Arial,sans-serif !important;}</style>
<![endif]-->
</head>
<body style="margin:0;padding:0;background-color:${BRAND.page};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${BRAND.page};">${escapeHtml(preheader)}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;background-color:${BRAND.page};">
  <tr>
    <td align="center" style="padding:28px 12px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:100%;max-width:600px;">
        <!-- Header -->
        <tr>
          <td style="background-color:${BRAND.green};border-radius:14px 14px 0 0;padding:22px 32px;">
            <div style="color:#ffffff;font-family:${FONT};font-size:19px;font-weight:bold;letter-spacing:2px;line-height:22px;">SVUFO</div>
            <div style="color:#cde0d7;font-family:${FONT};font-size:11px;letter-spacing:1px;line-height:16px;text-transform:uppercase;">Kassenzählprotokoll</div>
          </td>
        </tr>
        <!-- Brass hairline -->
        <tr><td style="background-color:${BRAND.brass};font-size:0;line-height:0;height:3px;">&nbsp;</td></tr>
        <!-- Body -->
        <tr>
          <td style="background-color:${BRAND.card};padding:30px 32px 8px;">
            <p style="margin:0 0 4px;color:${BRAND.brass};font-family:${FONT};font-size:12px;font-weight:bold;letter-spacing:1px;line-height:16px;text-transform:uppercase;">${escapeHtml(eyebrow)}</p>
            <h1 style="margin:0 0 18px;color:${BRAND.ink};font-family:${FONT};font-size:22px;font-weight:bold;line-height:28px;">${escapeHtml(heading)}</h1>
            ${blocks.join("\n")}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background-color:${BRAND.card};border-radius:0 0 14px 14px;border-top:1px solid ${BRAND.border};padding:20px 32px 26px;">
            <p style="margin:0 0 4px;color:${BRAND.ink};font-family:${FONT};font-size:13px;font-weight:bold;line-height:18px;">${escapeHtml(verein)}</p>
            <p style="margin:0;color:${BRAND.muted};font-family:${FONT};font-size:12px;line-height:17px;">Diese E-Mail wurde automatisch von SVUFO gesendet. Bitte nicht direkt darauf antworten.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px 0;">
            <p style="margin:0;color:${BRAND.muted};font-family:${FONT};font-size:11px;line-height:16px;text-align:center;">&copy; ${year} ${escapeHtml(verein)} &middot; l&auml;uft mit SVUFO</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}
