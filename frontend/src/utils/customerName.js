/**
 * The customer's name from an engagement, whichever shape it arrived in.
 *
 * satellite's engagement and report lists flatten `customer` to the name, but
 * a single engagement from forge carries `customer` as an object ({ id, name,
 * contact... }) alongside a flat `customerName`. Rendering that object as text
 * is a React error (#31) that blanks the page.
 */
export function customerName(engagement) {
    const customer = engagement?.customer;
    if (typeof customer === "string") return customer;
    return customer?.name || engagement?.customerName || "";
}
