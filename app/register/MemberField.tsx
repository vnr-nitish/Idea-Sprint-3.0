"use client";

import React, { memo } from "react";

interface TeamMember {
  name: string;
  registrationNumber: string;
  email: string;
  phoneNumber: string;
  school: string;
  program: string;
  programOther: string;
  branch: string;
  campus: string;
  stay: string;
  yearOfStudy: string;
}

type Props = {
  index: number;
  member: TeamMember;
  isTeamLead?: boolean;
  onChange: (index: number, field: keyof TeamMember, value: string) => void;
  errors: Record<string, string>;
};

const MemberField = ({ index, member, isTeamLead = false, onChange, errors }: Props) => {
  const fieldError = (field: string) => errors[`member${index}_${field}`] || "";
  const inputClass = (field: string) => `hh-input ${fieldError(field) ? "border-gitam-600 bg-antique-100" : ""}`;

  return (
    <div className="h-full flex flex-col">
      <h3 className="text-lg font-semibold text-gitam-700 mb-3">
        {isTeamLead ? "Team Lead Details" : `Member ${index + 1} Details`}
      </h3>

      <div className="grid grid-cols-2 gap-3 flex-1">
        <div>
          <label className="block text-sm font-semibold text-gitam-700 mb-1">Campus <span className="text-gitam">*</span></label>
          <select
            value={member.campus}
            onChange={(e) => onChange(index, "campus", e.target.value)}
            className={inputClass("campus")}
          >
            <option value="" disabled hidden>Select Campus</option>
            <option value="Visakhapatnam">Visakhapatnam</option>
          </select>
          {fieldError("campus") && <p className="text-gitam-700 text-xs mt-1">⚠️ {fieldError("campus")}</p>}
        </div>

        <div>
          <label className="block text-sm font-semibold text-gitam-700 mb-1">Full Name <span className="text-gitam">*</span></label>
          <input
            type="text"
            value={member.name}
            onChange={(e) => onChange(index, "name", e.target.value)}
            placeholder="Full name"
            className={inputClass("name")}
          />
          {fieldError("name") && <p className="text-gitam-700 text-xs mt-1">⚠️ {fieldError("name")}</p>}
        </div>

        <div>
          <label className="block text-sm font-semibold text-gitam-700 mb-1">Registration Number <span className="text-gitam">*</span></label>
          <input
            type="text"
            value={member.registrationNumber}
            onChange={(e) => onChange(index, "registrationNumber", e.target.value)}
            placeholder="Registration number"
            className={inputClass("registrationNumber")}
          />
          {fieldError("registrationNumber") && <p className="text-gitam-700 text-xs mt-1">⚠️ {fieldError("registrationNumber")}</p>}
        </div>

        <div>
          <label className="block text-sm font-semibold text-gitam-700 mb-1">GITAM Mail <span className="text-gitam">*</span></label>
          <input
            type="email"
            value={member.email}
            onChange={(e) => onChange(index, "email", e.target.value)}
            placeholder="email@gitam.in or email@student.gitam.edu"
            className={inputClass("email")}
          />
          {fieldError("email") && <p className="text-gitam-700 text-xs mt-1">⚠️ {fieldError("email")}</p>}
        </div>

        <div>
          <label className="block text-sm font-semibold text-gitam-700 mb-1">Phone Number <span className="text-gitam">*</span></label>
          <input
            type="tel"
            value={member.phoneNumber}
            onChange={(e) => onChange(index, "phoneNumber", e.target.value)}
            placeholder="10-digit phone number"
            inputMode="numeric"
            maxLength={10}
            className={inputClass("phoneNumber")}
          />
          {fieldError("phoneNumber") && <p className="text-gitam-700 text-xs mt-1">⚠️ {fieldError("phoneNumber")}</p>}
        </div>

        <div>
          <label className="block text-sm font-semibold text-gitam-700 mb-1">School <span className="text-gitam">*</span></label>
          <input
            list="schools"
            value={member.school}
            onChange={(e) => onChange(index, "school", e.target.value)}
            placeholder="Select School"
            className={inputClass("school")}
          />
          <datalist id="schools">
            <option value="School of CSE" />
            <option value="School of Core Engineering" />
            <option value="School of Science" />
            <option value="School of Business" />
            <option value="School of Humanities" />
            <option value="School of Architecture" />
            <option value="School of Law" />
            <option value="School of Pharmacy" />
            <option value="Others" />
          </datalist>
          {fieldError("school") && <p className="text-gitam-700 text-xs mt-1">⚠️ {fieldError("school")}</p>}
        </div>

        <div>
          <label className="block text-sm font-semibold text-gitam-700 mb-1">Program <span className="text-gitam">*</span></label>
          <select
            value={member.program}
            onChange={(e) => onChange(index, "program", e.target.value)}
            className={inputClass("program")}
          >
            <option value="" disabled hidden>Select Program</option>
            <option value="B.Tech">B.Tech</option>
            <option value="M.Tech">M.Tech</option>
            <option value="B.Sc">B.Sc</option>
            <option value="M.Sc">M.Sc</option>
            <option value="BBA">BBA</option>
            <option value="MBA">MBA</option>
            <option value="Others">Others</option>
          </select>
          {fieldError("program") && <p className="text-gitam-700 text-xs mt-1">⚠️ {fieldError("program")}</p>}
        </div>

        {member.program === "Others" && (
          <div>
            <label className="block text-sm font-semibold text-gitam-700 mb-1">Specify Your Program <span className="text-gitam">*</span></label>
            <input
              type="text"
              value={member.programOther}
              onChange={(e) => onChange(index, "programOther", e.target.value)}
              placeholder="Enter your program"
              className={inputClass("programOther")}
            />
            {fieldError("programOther") && <p className="text-gitam-700 text-xs mt-1">⚠️ {fieldError("programOther")}</p>}
          </div>
        )}

        <div>
          <label className="block text-sm font-semibold text-gitam-700 mb-1">Branch <span className="text-gitam">*</span></label>
          <input
            type="text"
            value={member.branch}
            onChange={(e) => onChange(index, "branch", e.target.value)}
            placeholder="Branch (e.g., CSE, ECE)"
            className={inputClass("branch")}
          />
          {fieldError("branch") && <p className="text-gitam-700 text-xs mt-1">⚠️ {fieldError("branch")}</p>}
        </div>

        <div>
          <label className="block text-sm font-semibold text-gitam-700 mb-1">Year of Study <span className="text-gitam">*</span></label>
          <select
            value={member.yearOfStudy}
            onChange={(e) => onChange(index, "yearOfStudy", e.target.value)}
            className={inputClass("yearOfStudy")}
          >
            <option value="" disabled hidden>Select Year</option>
            <option value="1st Year">1st Year</option>
            <option value="2nd Year">2nd Year</option>
            <option value="3rd Year">3rd Year</option>
            <option value="4th Year">4th Year</option>
            <option value="5th Year">5th Year</option>
          </select>
          {fieldError("yearOfStudy") && <p className="text-gitam-700 text-xs mt-1">⚠️ {fieldError("yearOfStudy")}</p>}
        </div>

        <div>
          <label className="block text-sm font-semibold text-gitam-700 mb-1">Stay Type <span className="text-gitam">*</span></label>
          <select
            value={member.stay}
            onChange={(e) => onChange(index, "stay", e.target.value)}
            className={inputClass("stay")}
          >
            <option value="" disabled hidden>Select Stay Type</option>
            <option value="Hostel">Hostel</option>
            <option value="Day Scholar">Day Scholar</option>
          </select>
          {fieldError("stay") && <p className="text-gitam-700 text-xs mt-1">⚠️ {fieldError("stay")}</p>}
        </div>

        {/* When program is Other we already show the 'Specify Your Program' input next to Program above; no duplicate needed here */}
      </div>
    </div>
  );
};

export default memo(MemberField);
