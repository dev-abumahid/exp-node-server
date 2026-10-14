import catchAsync from '../../utils/catch_async.js';
import manageResponse from '../../utils/manage_response.js';
import { profile_service } from './profile.service.js';

const update_profile = catchAsync(async (req, res) => {
  const result = await profile_service.update_profile_into_db(req);
  manageResponse(res, {
    success: true,
    statusCode: 200,
    message: 'profile updated successfully.',
    data: result,
  });
});

export const profile_controller = {
  update_profile,
};
