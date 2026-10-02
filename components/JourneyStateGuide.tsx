"use client";
import Link from "next/link";

type GuideRow=readonly [title:string,whatHappened:string,nextAction:string,actor:string,deadline:string];
type Props={id:string;title:string;description:string;selectLabel:string;
  states:Record<string,GuideRow>;selected:string;onSelect:(key:string)=>void;
  link?:{href:string;label:string}};

export default function JourneyStateGuide({id,title,description,selectLabel,states,selected,onSelect,link}:Props){
  const current=states[selected];
  return <section className="journey-preview" aria-labelledby={id}>
    <div><span>SYNTHETIC STATE GUIDE / NO SERVER ACTIONS</span><h2 id={id}>{title}</h2>
      <p>{description}</p><label htmlFor={`${id}-state`}>{selectLabel}</label>
      <select id={`${id}-state`} value={selected} onChange={event=>onSelect(event.target.value)}>
        {Object.entries(states).map(([key,row])=><option key={key} value={key}>{row[0]}</option>)}
      </select>
    </div>
    <article className="journey-preview-card"><span>EXAMPLE ONLY</span><h3>{current[0]}</h3>
      <dl>{["What happened","Next action","Who acts next","By when"].map((label,index)=><div key={label}>
        <dt>{label}</dt><dd>{current[index+1]}</dd></div>)}</dl>
      {link&&<Link href={link.href}>{link.label}</Link>}
    </article>
  </section>;
}
