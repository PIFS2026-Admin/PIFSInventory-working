import { createClient } from "@supabase/supabase-js";

type Body = Record<string, unknown>;
function adminClient() { const url=process.env.NEXT_PUBLIC_SUPABASE_URL; const key=process.env.SUPABASE_SERVICE_ROLE_KEY; if(!url||!key) throw new Error("Supabase server configuration is missing."); return createClient(url,key,{auth:{persistSession:false}}); }
function text(value:unknown){return String(value??"").trim();}
function lower(value:unknown){return text(value).toLowerCase();}
function uuid(value:string){return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);}
function message(error:unknown){return error instanceof Error?error.message:String((error as {message?:unknown})?.message??error);}
function missing(error:unknown){const value=lower(message(error));return value.includes("titan_dti_crew_assignments")||value.includes("schema cache");}

async function authorize(request:Request,admin:ReturnType<typeof adminClient>){
  const token=(request.headers.get("authorization")??"").replace(/^Bearer\s+/i,"").trim();
  if(!token)return {error:Response.json({error:"You must be signed in."},{status:401})};
  const {data:userData}=await admin.auth.getUser(token); const user=userData.user;
  if(!user)return {error:Response.json({error:"Your session could not be verified."},{status:401})};
  const {data:profile}=await admin.from("profiles").select("full_name,email,is_disabled").eq("id",user.id).maybeSingle();
  const isWade=lower(profile?.full_name)==="wade wisenor"||lower(profile?.email||user.email)==="wade@pathfinderinspections.com";
  if(!profile||profile.is_disabled||!isWade)return {error:Response.json({error:"The DTI Crew Schedule is currently restricted to Wade."},{status:403})};
  return {userId:user.id};
}

export async function GET(request:Request){
  try{
    const admin=adminClient(); const auth=await authorize(request,admin); if("error" in auth)return auth.error;
    const url=new URL(request.url); const from=text(url.searchParams.get("from")); const to=text(url.searchParams.get("to"));
    let assignmentQuery=admin.from("titan_dti_crew_assignments").select("*").is("archived_at",null).order("starts_on");
    if(from)assignmentQuery=assignmentQuery.gte("ends_on",from); if(to)assignmentQuery=assignmentQuery.lte("starts_on",to);
    const [assignments,people,jobs]=await Promise.all([
      assignmentQuery,
      admin.from("profiles").select("id,full_name,email,role,department,is_disabled").eq("is_disabled",false).order("full_name"),
      admin.from("titan_jobs").select("id,job_number,title,customer_name,rig_name,lifecycle_status,scheduled_start").ilike("service_line","DTI").is("archived_at",null).order("scheduled_start",{ascending:false,nullsFirst:false}).limit(1000),
    ]);
    for(const result of [assignments,people,jobs])if(result.error)throw result.error;
    return Response.json({ok:true,assignments:assignments.data??[],people:(people.data??[]).filter(row=>!["customer","operator"].includes(lower(row.role))),jobs:jobs.data??[]});
  }catch(error){return Response.json({error:missing(error)?"Run supabase/titan_dti_crew_schedule.sql before opening the Crew Schedule.":message(error)},{status:missing(error)?409:500});}
}

export async function POST(request:Request){
  try{
    const admin=adminClient(); const auth=await authorize(request,admin); if("error" in auth)return auth.error; const body=await request.json().catch(()=>({})) as Body;
    const id=text(body.id),profileId=text(body.profileId),jobId=text(body.jobId),startsOn=text(body.startsOn),endsOn=text(body.endsOn);
    if(!uuid(profileId)||!uuid(jobId)||!/^\d{4}-\d{2}-\d{2}$/.test(startsOn)||!/^\d{4}-\d{2}-\d{2}$/.test(endsOn))return Response.json({error:"Person, DTI job, start date, and end date are required."},{status:400});
    if(endsOn<startsOn)return Response.json({error:"End date cannot be before the start date."},{status:400});
    const payload={profile_id:profileId,job_id:jobId,assignment_role:text(body.assignmentRole)||"Inspector",starts_on:startsOn,ends_on:endsOn,status:text(body.status)||"Scheduled",notes:text(body.notes)||null,updated_by:auth.userId};
    const query=id&&uuid(id)?admin.from("titan_dti_crew_assignments").update(payload).eq("id",id):admin.from("titan_dti_crew_assignments").insert({...payload,created_by:auth.userId});
    const {data,error}=await query.select().single(); if(error)throw error;
    const {data:overlaps}=await admin.from("titan_dti_crew_assignments").select("id,starts_on,ends_on").eq("profile_id",profileId).is("archived_at",null).neq("status","Cancelled").lte("starts_on",endsOn).gte("ends_on",startsOn).neq("id",data.id);
    return Response.json({ok:true,assignment:data,warning:overlaps?.length?"This person has another assignment during these dates.":null});
  }catch(error){return Response.json({error:missing(error)?"Run supabase/titan_dti_crew_schedule.sql before saving assignments.":message(error)},{status:missing(error)?409:500});}
}

export async function DELETE(request:Request){
  try{const admin=adminClient();const auth=await authorize(request,admin);if("error" in auth)return auth.error;const id=text(new URL(request.url).searchParams.get("id"));if(!uuid(id))return Response.json({error:"Select a valid assignment."},{status:400});const {error}=await admin.from("titan_dti_crew_assignments").update({archived_at:new Date().toISOString(),updated_by:auth.userId}).eq("id",id);if(error)throw error;return Response.json({ok:true});}catch(error){return Response.json({error:message(error)},{status:500});}
}
