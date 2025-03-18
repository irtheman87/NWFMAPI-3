import express, { Request, Response } from 'express';
import { createCrewMember, createCompany, createCrewCompany, loginCrewCompany, getCrewById, getCompanyById, updateCompanyDetails, updateCrewDetails, updateProfilePicture, updateCompanyProfilePicture, addEmailToList, requestPasswordReset, resetPassword } from '../controllers/joinController';
import { uploads } from '../utils/UtilityFunctions';

const router = express.Router();

//  router.post('/crew', createCrewMember);
 router.post('/crew', uploads, createCrewMember);
//  router.post('/company', createCompany);
router.post('/company', uploads,  createCompany);
 router.post("/crewcompany", createCrewCompany);
 router.post("/crewcompany/login", loginCrewCompany);
 router.get("/crew/:id", getCrewById);
 router.get("/company/:id", getCompanyById);
 router.post("/company/update", updateCompanyDetails);
 router.put("/update-crew", updateCrewDetails);
 router.post('/update-company-picture', updateCompanyProfilePicture);
 router.post('/update-profile-picture', updateProfilePicture);
 router.post("/email-list", addEmailToList);
 router.post('/forgotpassword', requestPasswordReset);
 router.post('/resetpassword/:token', resetPassword);


module.exports = router;
