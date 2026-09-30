import Link from "next/link";
import {StatePanel,StatusTag} from "@/components/ProductStates";
export default function PrelaunchPage({eyebrow,title,status,stateTitle,children,action}:{eyebrow:string;title:string;status:string;stateTitle:string;children:React.ReactNode;action?:{href:string;label:string}}){
  return <div className="participant-placeholder"><span>{eyebrow}</span><h1>{title}</h1><StatusTag tone="restricted">{status}</StatusTag><StatePanel title={stateTitle} tone="restricted" action={action&&<Link href={action.href}>{action.label}</Link>}>{children}</StatePanel></div>;
}
