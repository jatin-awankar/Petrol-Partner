"use client";

import {useState} from "react";
import Link from "next/link";
import {toast} from "sonner";
import {useProfileData} from "@/hooks/profile/useProfileData";
import {useUserProfile} from "@/hooks/auth/useUserProfile";
import {useCurrentUser} from "@/hooks/auth/useCurrentUser";
import {ProfileSettingsPageSkeleton} from "@/components/profile/ProfileSkeletons";
import ProfileHeader from "@/components/profile/ProfileHeader";
import PersonalInfoSection,{type User as PersonalInfo} from "@/components/profile/PersonalInfoSection";
import VehicleInfoSection from "@/components/profile/VehicleInfoSection";
import PreferencesSection,{type Preferences} from "@/components/profile/PreferencesSection";
import SafetySection,{type TrustedContact,type SafetySettingsData} from "@/components/profile/SafetySection";
import AccountSecuritySection from "@/components/profile/AccountSecuritySection";
import AccountReadiness from "@/components/profile/AccountReadiness";

type Section="personal"|"vehicles"|"preferences"|"safety"|"security";

function AccountSettings(){
  const {user,vehicles,preferences,safetySettings,securitySettings,loading,error,
    savePreferences,saveSafety,refetch}=useProfileData();
  const {updateProfile}=useUserProfile();
  const [open,setOpen]=useState<Section|null>(null);
  const [photoUploading,setPhotoUploading]=useState(false);
  const toggle=(section:Section)=>setOpen(current=>current===section?null:section);

  if(loading&&!user)return <ProfileSettingsPageSkeleton/>;
  if(!user)return <main className="mx-auto max-w-3xl space-y-4 px-4 py-8" role="alert">
    <h1 className="text-2xl font-semibold">Account details unavailable</h1>
    <p>{error??"We could not load this account."}</p>
    <button type="button" className="min-h-11 rounded-md border px-4" onClick={()=>void refetch.user()}>Try again</button>
  </main>;

  async function savePersonal(data:PersonalInfo){
    await updateProfile({full_name:data.name??"",phone:data.phone??"",date_of_birth:data.dateOfBirth??null,
      gender_for_matching:data.gender==="female"||data.gender==="male"?data.gender:null,
      emergency_contact_name:data.emergencyContact??null,emergency_contact_phone:data.emergencyPhone??null,
      address:data.address??null});
    await refetch.user();
    toast.success("Account details saved.");
  }
  async function saveComfort(data:Preferences){
    await savePreferences(data);
    toast.success("Comfort preferences saved.");
  }
  async function saveContacts(data:{trustedContacts:TrustedContact[];settings:SafetySettingsData}){
    await saveSafety({trustedContacts:data.trustedContacts.map(({id,...contact})=>
      String(id).startsWith("tmp-")?contact:{id,...contact}),
      settings:Object.fromEntries(Object.entries(data.settings).filter((entry):entry is [string,boolean]=>typeof entry[1]==="boolean"))});
    toast.success("Trusted contacts saved. Automatic trip sharing is not active.");
  }
  async function uploadPhoto(file:File){
    if(!file.type.startsWith("image/")||file.size>3*1024*1024){toast.error("Choose an image up to 3 MB.");return;}
    setPhotoUploading(true);
    try{
      const image=await new Promise<string>((resolve,reject)=>{
        const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));
        reader.onerror=()=>reject(new Error("Could not read image."));reader.readAsDataURL(file);
      });
      await updateProfile({profile_image:image});await refetch.user();toast.success("Profile photo updated.");
    }catch(reason){toast.error(reason instanceof Error?reason.message:"Photo update failed.");}
    finally{setPhotoUploading(false);}
  }
  const sectionNav:{id:Section;label:string}[]=[
    {id:"personal",label:"Personal"},{id:"vehicles",label:"Past vehicles"},
    {id:"preferences",label:"Comfort"},{id:"safety",label:"Trusted contacts"},
    {id:"security",label:"Security"},
  ];
  return <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-8">
    <div><Link href="/dashboard" className="inline-flex min-h-11 items-center underline">← Home</Link>
      <p className="mt-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Your account / 03</p>
      <h1 className="text-3xl font-semibold">Account and declarations</h1>
      <p className="mt-2 text-muted-foreground">Review what is recorded, update your details, and see which actions are available before launch.</p></div>
    <ProfileHeader user={user} onPhotoUpload={uploadPhoto} onEditProfile={()=>{setOpen("personal");
      document.getElementById("account-personal")?.scrollIntoView({behavior:"smooth"});}} isPhotoUploading={photoUploading}/>
    <AccountReadiness/>
    <nav aria-label="Account sections" className="flex flex-wrap gap-2">
      {sectionNav.map(item=><a key={item.id} href={`#account-${item.id}`} onClick={()=>setOpen(item.id)}
        className="inline-flex min-h-11 items-center rounded-full border px-4 text-sm hover:bg-muted">{item.label}</a>)}
    </nav>
    {error&&<p role="alert" className="rounded-xl border p-4">Some settings could not be loaded: {error}</p>}
    <div className="space-y-4">
      <div id="account-personal" className="scroll-mt-24"><PersonalInfoSection user={{...user}} onSave={savePersonal}
        isExpanded={open==="personal"} onToggle={()=>toggle("personal")}/></div>
      <div id="account-vehicles" className="scroll-mt-24"><VehicleInfoSection vehicles={vehicles}
        isExpanded={open==="vehicles"} onToggle={()=>toggle("vehicles")}/></div>
      <div id="account-preferences" className="scroll-mt-24"><PreferencesSection preferences={preferences}
        onSave={saveComfort} isExpanded={open==="preferences"} onToggle={()=>toggle("preferences")}/></div>
      <div id="account-safety" className="scroll-mt-24"><SafetySection safetySettings={{
        trustedContacts:(safetySettings.trustedContacts??[]).map((contact,index)=>({
          id:contact.id??String(index),name:contact.name,phone:contact.phone,
          relationship:contact.relationship,email:contact.email})),
        settings:safetySettings.settings??{},
      }} onSave={saveContacts} isExpanded={open==="safety"} onToggle={()=>toggle("safety")}/></div>
      <div id="account-security" className="scroll-mt-24"><AccountSecuritySection securitySettings={{
        twoFactorEnabled:securitySettings.two_factor?.enabled??false,
        twoFactorMethod:securitySettings.two_factor?.method as "SMS"|"Email"|"App"|undefined,
        passwordLastChanged:securitySettings.password_last_changed_at??undefined,
      }} loginActivity={(securitySettings.login_activity??[]).map(item=>({id:item.id,device:item.device,
        ipAddress:item.ip_address??undefined,time:item.time??undefined,current:item.current,
        lastActive:item.expires_at??undefined}))}
        isExpanded={open==="security"} onToggle={()=>toggle("security")}/></div>
    </div>
    <section className="rounded-xl border p-5" aria-label="Historical corridor records">
      <h2 className="text-xl font-semibold">Historical corridor records</h2>
      <p className="mt-2 text-sm text-muted-foreground">Earlier approvals, vehicles, and settlement records remain separate from the new route policy. They do not enable new bookings.</p>
      <div className="mt-3 flex flex-wrap gap-3">
        <Link href="/eligibility" className="inline-flex min-h-11 items-center rounded-md border px-4 underline">Historical corridor records</Link>
        <Link href="/direct-settlements" className="inline-flex min-h-11 items-center rounded-md border px-4 underline">Historical contributions</Link>
      </div>
    </section>
  </main>;
}

export default function ProfileSettingsPage(){
  const {user,loading}=useCurrentUser();
  if(loading)return <ProfileSettingsPageSkeleton/>;
  if(!user)return <main className="mx-auto max-w-3xl space-y-4 px-4 py-8">
    <h1 className="text-2xl font-semibold">Sign in to view account settings</h1>
    <p>Your account, declarations, and historical records are private.</p>
    <Link href="/login" className="inline-flex min-h-11 items-center rounded-md border px-4 underline">Sign in</Link>
  </main>;
  return <AccountSettings/>;
}
