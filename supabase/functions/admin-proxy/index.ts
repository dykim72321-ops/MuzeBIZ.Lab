import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-key',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Authenticate the user using the Supabase JWT from the Authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      console.error('[AdminProxy] Auth error:', authError)
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 2. Prepare the proxy request
    const { method, url } = req
    const urlObj = new URL(url)
    
    // Extract the target path after /admin-proxy
    // pathname example: /admin-proxy/api/broker/status
    const targetPath = urlObj.pathname.replace('/admin-proxy', '')
    const search = urlObj.search
    
    // Get backend configuration from environment variables
    const pythonEngineUrl = Deno.env.get('PYTHON_ENGINE_URL') || 'http://localhost:8001'
    const adminSecretKey = Deno.env.get('ADMIN_SECRET_KEY')

    if (!adminSecretKey) {
      console.error('[AdminProxy] ADMIN_SECRET_KEY is not set')
      return new Response(JSON.stringify({ error: 'Server configuration error: ADMIN_SECRET_KEY missing' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Read body if applicable
    let body: unknown = null
    if (method !== 'GET' && method !== 'HEAD') {
      try {
        body = await req.json()
      } catch {
        // Fallback or ignore if no body
      }
    }

    console.log(`[AdminProxy] Forwarding ${method} ${targetPath}${search} to ${pythonEngineUrl}`)

    // 3. Forward the request to the Python engine with the secret key
    const pythonResponse = await fetch(`${pythonEngineUrl}${targetPath}${search}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Key': adminSecretKey,
        'Bypass-Tunnel-Reminder': 'true',
      },
      body: body ? JSON.stringify(body) : undefined,
    })

    const responseData = await pythonResponse.json().catch(() => ({ message: 'No JSON response' }))

    return new Response(JSON.stringify(responseData), {
      status: pythonResponse.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[AdminProxy] Critical Error: ${message}`)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
