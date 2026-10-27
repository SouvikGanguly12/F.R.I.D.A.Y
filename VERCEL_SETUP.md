# Deploy FRIDAY for phone voice chat

This Vercel app gives your phone a private browser voice-chat interface. It is
not a Linphone/carrier phone call and it cannot control programs running on
your laptop. Use the site over HTTPS and allow microphone access. Typed chat
works in mobile browsers; speech recognition works best in Chrome on Android.

The **Hands-free** option restarts browser speech recognition while the page is
open and visible, and requests that the screen stay awake. Mobile browsers and
operating systems may still suspend it, and it cannot listen continuously in
the background or while the phone is locked. Stop hands-free listening before
leaving the page.

FRIDAY asks for a city whenever you request current weather; it uses the free
Open-Meteo geocoding and weather APIs without requiring a weather API key.
The Local time card and "what time is it?" command use the phone's local
timezone and do not need an API.
Explicit memories are saved only in the current browser's local storage, not
synced across devices; memory text is sent to OpenRouter along with chat for
personalization. Avoid saving secrets or highly sensitive personal details.

## Deploy

1. Revoke the OpenRouter API key that was previously placed in `.env` or
   exposed in chat. Create a replacement key.
2. Push this project to a private GitHub repository, or deploy the workspace
   with the Vercel CLI. Before committing, run `git status` and confirm `.env`
   and `password.txt` are not listed. They are excluded by `.gitignore`.
3. Import the repository in Vercel.
4. In the Vercel project's **Settings → Environment Variables**, add:
   - `OPENROUTER_API_KEY`: the new OpenRouter API key.
   - `FRIDAY_APP_PASSWORD`: a new, long password used to sign in to the app.
   - `OPENROUTER_MODEL` (optional): a model enabled for your OpenRouter account.
5. Deploy or redeploy, then open the HTTPS Vercel URL on your phone and sign
   in with `FRIDAY_APP_PASSWORD`.
6. Tap **Tap to talk**, or enable **Hands-free** while keeping the page open,
   allow microphone access, speak, and listen to FRIDAY's reply. You can also
   type a message. The app does not expose the API key to the phone browser.
   Choose English or Hindi / Hinglish reply speech from the **Voice reply
   language** menu; automatic mode follows the language of FRIDAY's response.

The app password is required because a public, unauthenticated API endpoint
could use your model credits. Sessions expire after 12 hours. Chat requests
are sent to OpenRouter; browser voice recognition and speech playback depend
on the mobile browser's speech services. Avoid sharing sensitive information.

Never put an API key in HTML, JavaScript, Git, or `.gitignore`. `.gitignore`
only prevents local files such as `.env` from being committed; Vercel secrets
belong in the project's Environment Variables settings.

## Websites, Notion, and Google Calendar

The website shortcuts open a fixed allow-list of public sites. You can also
say "open Google", "open YouTube", "open Gmail", "open Calendar", "open
Notion", "open Wikipedia", "open GitHub", "open Maps", "open Instagram",
"open Facebook", "open LinkedIn", "open ChatGPT", "open Spotify", or "open
Netflix". The browser may
block a voice-triggered new tab; if it does, FRIDAY displays a link to tap.

### Notion notes

1. Create a Notion internal integration and grant it page read/content insert
   permissions.
2. Share the destination parent page with that integration, then copy the
   destination page ID from its Notion URL.
3. Add these Vercel Environment Variables:
   - `NOTION_API_KEY`: the integration secret.
   - `NOTION_PARENT_PAGE_ID`: the shared parent page ID.
4. Redeploy. FRIDAY can create a note only after you review and confirm it in
   the app.

### Google Calendar

1. Create a Google Cloud project, enable the Google Calendar API, and create
   an OAuth client ID and client secret. Configure the OAuth consent screen
   and add your account as a test user while the app is in testing.
2. Obtain an offline OAuth refresh token for the scope
   `https://www.googleapis.com/auth/calendar.events`. Google OAuth Playground
   can do this with your own OAuth client credentials: in its settings enable
   "Use your own OAuth credentials", enter the client ID and secret, and add
   `https://developers.google.com/oauthplayground` as an authorized redirect
   URI on the OAuth client. Select the Calendar events scope, authorize your
   Google account, exchange the code, and copy the refresh token. Keep it
   secret.
3. Add these Vercel Environment Variables:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REFRESH_TOKEN`
   - `GOOGLE_CALENDAR_ID` (optional; defaults to `primary`)
4. Redeploy. FRIDAY can list events in the next seven days and create an event
   only after you review and confirm its title and time.

Google Calendar uses a refresh token for the selected account. Store it only
in Vercel Environment Variables. Current event listing and creation are
available from the Calendar controls; they are not yet inferred from arbitrary
AI-generated chat.

After adding or changing any integration variables, redeploy and reopen the
app. The status under each integration card shows whether the required
variables are present. Notes and events are not created from model-generated
text automatically; the app asks you to review and confirm them first.

For a GitHub deployment, import the private repository in Vercel and add the
environment variables before the first deployment. For CLI deployment,
install and sign in to the Vercel CLI, add the same secrets in the Vercel
project settings, then deploy this folder with `vercel --prod`. There is no
Vercel account linked to this workspace, so deployment must be completed from
your own Vercel account.
