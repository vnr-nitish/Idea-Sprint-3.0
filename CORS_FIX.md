# CORS Issue - Teams Not Loading - FIX APPLIED

## Problem
Teams were not loading in the team profile section. Browser console showed:
```
Access to fetch at 'https://xkcjtdyhocgweexxcqto.supabase.co/rest/v1/teams...' 
from origin 'https://ideasprint-tmgc-gcgc.vercel.app' 
has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header
```

## Root Cause
The app was trying to make **direct REST API calls from the browser to Supabase**, but your domain wasn't whitelisted in Supabase's CORS settings.

## Solution Applied ✅
Modified `/lib/teamsBackend.ts` to:
1. **PRIMARY**: Use the server-side API route `/api/admin/teams-direct` (bypasses CORS completely)
2. **FALLBACK**: Try direct Supabase queries only if API fails
3. **CACHE**: Use localStorage fallback if both fail

This means:
- ✅ Works immediately without Supabase CORS configuration
- ✅ Teams load from the server API (secure & no CORS issues)
- ✅ Fallback to Supabase for environments where API isn't available

## Testing
1. Hard refresh your browser (Ctrl+Shift+R / Cmd+Shift+R)
2. Go to `/admin/team-profiles` or `/spoc/team-profiles`
3. Teams should now load successfully ✓

If teams still don't appear:
- Check browser console (F12) for any new errors
- Check if the server is actually running (`npm run dev`)
- Verify your Supabase database has team records

## Optional: Configure CORS for Direct Supabase Queries
If you want to use direct Supabase queries (not recommended for production), configure CORS:

1. Go to **Supabase Dashboard** → Project Settings → API
2. Under "Allowed Client IPs/URLs", add your domain:
   - For development: `http://localhost:3000`
   - For production: `https://ideasprint-tmgc-gcgc.vercel.app`
3. Or allow all origins (not secure): `*`

However, using the server API route is **more secure and recommended**.

## Files Modified
- `/lib/teamsBackend.ts` - Prioritized server API over direct Supabase queries
