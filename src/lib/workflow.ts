// ===== TEMPLATE: Patient type & workflow definitions =====
// Replace these with your actual board-specific types.

export interface Patient {
  id: string;
  name: string;
  dob: string;
  memberId1?: string;
  memberId2?: string;
  primaryInsurance?: string;
  serving?: string;
  notes: string;
  lastUpdated?: string;
  /** Add domain-specific fields here, e.g.:
   * medNecStatus?: string;
   * diagnosisCode?: string;
   */
}
