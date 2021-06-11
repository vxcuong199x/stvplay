'use strict'

module.exports = function(Feedback) {
  
  Feedback.remoteMethod('getFeedbackList', {
    returns: {type: 'array', root: true},
    http: {verb: 'get'},
    description: 'Get feedback list'
  })

  Feedback.getFeedbackList = (cb) => {
    cb(null, {
      data: [
        { type: 1, content: 'Không xem được kênh' },
        { type: 2, content: 'Không xem được phim' },
        { type: 3, content: 'Không xem được clip' },
        { type: 4, content: 'Không nạp được tiền' }
      ]
    })
  }

  Feedback.remoteMethod('postFeedback', {
    accepts: [
      {arg: 'req', type: 'object', http: { source: 'req' }},
      {arg: 'type', type: 'number', required: true},
      {arg: 'content', type: 'string'}
    ],
    returns: {type: 'object', root: true},
    http: {verb: 'post'},
    description: 'Post feedback'
  })

  Feedback.postFeedback = (req, type, content, cb) => {
    Feedback.create({
      username: req.username,
      type,
      content
    })

    cb(null, { message: 'Cảm ơn bạn đã gửi phản hồi' })
  }
}
