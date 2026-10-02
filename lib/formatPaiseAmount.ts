export function formatPaiseAmount(paise:number,currency:string){
  const amount=new Intl.NumberFormat("en-IN",{style:"currency",currency}).format(paise/100);
  return `${currency} ${paise.toLocaleString("en-IN")} paise (${amount})`;
}
