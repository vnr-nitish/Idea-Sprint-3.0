export type DefaultSpocRecord = {
  id: string;
  name: string;
  email: string;
  phone: string;
};

export const DEFAULT_SPOCS: DefaultSpocRecord[] = [
  { id: 'SPOC1', name: 'Aarav Kumar', email: 'aarav.kumar@spoc.hackhub.test', phone: 'Aarav@7391' },
  { id: 'SPOC2', name: 'Diya Reddy', email: 'diya.reddy@spoc.hackhub.test', phone: 'Diya@6428' },
  { id: 'SPOC3', name: 'Ishaan Verma', email: 'ishaan.verma@spoc.hackhub.test', phone: 'Ishaan@5816' },
  { id: 'SPOC4', name: 'Meera Nair', email: 'meera.nair@spoc.hackhub.test', phone: 'Meera@9043' },
  { id: 'SPOC5', name: 'Rohan Das', email: 'rohan.das@spoc.hackhub.test', phone: 'Rohan@3175' },
  { id: 'SPOC6', name: 'Ananya Rao', email: 'ananya.rao@spoc.hackhub.test', phone: 'Ananya@8264' },
  { id: 'SPOC7', name: 'Kabir Shah', email: 'kabir.shah@spoc.hackhub.test', phone: 'Kabir@4539' },
  { id: 'SPOC8', name: 'Nisha Iyer', email: 'nisha.iyer@spoc.hackhub.test', phone: 'Nisha@7642' },
  { id: 'SPOC9', name: 'Arjun Patel', email: 'arjun.patel@spoc.hackhub.test', phone: 'Arjun@2981' },
];

export const ensureDefaultSpocs = <T extends { id?: string; name?: string; email?: string; phone?: string }>(
  list: T[]
): DefaultSpocRecord[] => {
  const byEmail = new Map<string, DefaultSpocRecord>();

  (list || []).forEach((s) => {
    const id = String(s?.id || '').trim();
    const name = String(s?.name || '').trim();
    const email = String(s?.email || '').trim().toLowerCase();
    const phone = String(s?.phone || '').trim();
    if (!id || !email) return;
    byEmail.set(email, { id, name, email, phone });
  });

  DEFAULT_SPOCS.forEach((s) => {
    if (!byEmail.has(s.email)) byEmail.set(s.email, s);
  });

  return Array.from(byEmail.values());
};