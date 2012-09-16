(function () {

var Card = Backbone.Model.extend({
	defaults: {
		state: 'normal',
	},
});

var Cards = Backbone.Collection.extend({
	model: Card,

	resetSelections: function (opts) {
		opts = opts || {};
		this.each(function (card) {
			if (card !== opts.except)
				card.set({index: 0, state: 'normal'});
		});
		send('submit', {});
	},
});

var CardView = Backbone.View.extend({
	tagName: 'li',

	events: {
		click: 'select',
	},

	select: function (event) {
		if (game.get('action') != 'nominate')
			return;
		if (this.model.get('state') != 'normal')
			hand.resetSelections();
		else
			this.model.set({state: 'selecting'});
	},

	initialize: function () {
		this.$el.append('<span/><a/>');
		this.model.on('change', this.render, this);
		this.model.on('remove', this.fadeAway, this);
	},

	render: function () {
		var attrs = this.model.attributes;
		this.$('a').text(this.model.id);
		this.$('span').text(attrs.index || '').toggle(!!attrs.index);
		this.$el.prop('class', attrs.state);
		return this;
	},

	fadeAway: function () {
		this.$el.animate({opacity: 0, width: 0}, function () {
			$(this).remove();
		});
	},
});

var HandView = Backbone.View.extend({
	tagName: 'ul',

	initialize: function () {
		this.model.on('reset', this.reset, this);
		this.model.on('add', this.addCard, this);
	},

	reset: function (model) {
		this.$el.empty();
		this.model.each(this.addCard, this);
	},

	addCard: function (card) {
		var view = new CardView({model: card});
		var $card = view.render().$el;
		$card.css({opacity: 0}).animate({opacity: 1});
		this.$el.append($card);
	},
});

var Game = Backbone.Model.extend({
	defaults: {
		status: 'Loading...',
	},

	initialize: function () {
		hand.on('change:state', this.selectionChanged, this);
	},

	selectionChanged: function (card, newState) {
		if (newState != 'selecting')
			return;
		var black = this.get('blackInfo');
		var n = black.blankCount;
		if (n < 2)
			return send('submit', {cards: [card.id]});
		// Figure out the next index
		var indices = _.filter(hand.pluck('index'), function (x) { return x; });
		indices.push(0);
		var index = _.max(indices) + 1;

		if (index > n) {
			index = 1;
			hand.resetSelections({except: card});
		}
		card.set({index: index});
		if (index == n) {
			var choices = hand.where({state: 'selecting'});
			choices.sort(function (a, b) {
				return a.get('index') - b.get('index');
			});
			send('submit', {cards: _.pluck(choices, 'id')});
		}
	},
});

var GameView = Backbone.View.extend({
	events: {
		'click .electing a': 'elect',
	},

	initialize: function () {
		var handView = new HandView({model: hand, id: 'myHand'});
		var $roster = $('<p/>', {id: 'roster'});
		var $submissions = $('<div/>', {id: 'submissions'});
		var black = $('<li class="black"><a/></li>').hide();
		var $chat = new ChatView({model: chat}).render().$el;
		var $social = $('<div id=social/>').append($roster, ' ', $chat);
		this.$el.prepend(black, $social, $submissions).append(handView.el);

		this.model.on('change:status change:error', this.renderStatus, this);
		this.model.on('change:roster', this.renderRoster, this);
		this.model.on('change:black', this.renderBlack, this);
		this.model.on('change:action', this.renderAction, this);
		this.model.on('change:submissions change:blackInfo', this.renderSubmissions, this);
	},

	elect: function (event) {
		if (this.model.get('action') != 'elect')
			return;
		var cards = $(event.currentTarget).data('cards');
		if (cards)
			send('elect', {cards: cards});
	},

	renderStatus: function () {
		var attrs = this.model.attributes;
		this.$('#status').text(attrs.status).prop('class', attrs.error ? 'error' : '');
	},

	renderCanJoin: function (model, canJoin) {
		this.$('#join').toggle(!!canJoin);
	},

	renderRoster: function (model, roster) {
		var $list = this.$('#roster').empty();
		_.each(roster, function (player) {
			var $a = $('<a/>', {
				text: player.name,
				class: player.kind,
			});
			if (player.score)
				$a.append('&nbsp;', $('<em/>', {text: '('+player.score+')'}));
			if (player.ready)
				$a.addClass('ready');
			if (player.abandoned)
				$a.addClass('abandoned');
			$list.append($a, '<br>');
		});
	},

	renderBlack: function (model, black) {
		var $black = this.$('.black:first');
		if (black) {
			var info = parseBlack(black);
			$black.find('a').text(info.text).hide().fadeIn();
			this.model.set({blackInfo: info});
		}
		else {
			this.model.set({blackInfo: null});
		}
		$black.toggle(!!black);
	},

	renderAction: function (model, action) {
		var electing = action == 'elect';
		this.$('#myHand').toggle(!electing).toggleClass('unlocked', action == 'nominate');
		this.$('#submissions').toggleClass('electing', electing);
	},

	renderSubmissions: function () {
		var $subs = this.$('#submissions');
		var subs = this.model.get('submissions');
		var black = this.model.get('blackInfo');
		if (!subs || !subs.length || !black)
			return $subs.hide();
		$subs.empty();
		var fadeIns = [];
		_.each(subs, function (sub) {
			var $a = $('<a/>', {data: {cards: sub.cards}});
			var tokens = applySubmission(black, sub, true);
			renderTokenized($a, tokens);
			sub.el = $a[0];
			$a.css({opacity: 0}).appendTo($subs);
			fadeIns.push($a);
		});
		$subs.show();

		function showNext() {
			if (!fadeIns.length)
				return;
			fadeIns.shift().animate({opacity: 1}, {complete: showNext});
		}
		showNext();
	},
});

function renderTokenized($dest, tokens) {
	_.each(tokens, function (bit) {
		if (bit.white)
			$dest.append($('<b/>', {text: bit.white}));
		else
			$dest.append(document.createTextNode(bit));
	});
}

var Account = Backbone.Model.extend({
});

var AccountView = Backbone.View.extend({
	id: 'account',

	events: {
		submit: 'changeName',
		'click #join': 'joinGame',
		'click #leave': 'leaveGame',
	},

	initialize: function () {
		this.model.on('change', this.render, this);
		var $join = $('<input type=button id=join value="Join game">').hide();
		var $leave = $('<input type=button id=leave value="Leave game">').hide();
		var $gameFull = $('<input type=button id=gameFull value="Game full" disabled>').hide();
		this.$el.append('<form><input id=username maxlength='+USERNAME_LENGTH+'> <input type=submit value="Set name"></form>', $join, $leave, $gameFull);
	},

	render: function () {
		var attrs = this.model.attributes;
		this.$('#username').val(attrs.name || '');
		var action = attrs.action;
		this.$('#join').toggle(action == 'join');
		this.$('#leave').toggle(action == 'leave');
		this.$('#gameFull').toggle(action == 'gameFull');
		if (action == 'gameFull') {
			var model = this.model;
			setTimeout(function () {
				if (model.get('action') == 'gameFull')
					model.set({action: 'join'});
			}, 1500);
		}
		return this;
	},

	joinGame: function () {
		send('join', {game: ''+GAME_ID});
		this.model.set({action: null});
	},

	leaveGame: function () {
		if (!confirm("Sure you want to leave? You'll lose your points."))
			return;
		send('leave', {});
		this.model.set({action: null});
	},

	changeName: function (event) {
		event.preventDefault();
		var name = this.$('#username').val().trim();
		if (name)
			send('setName', {name: name});
	},
});

var ChatMessage = Backbone.Model.extend({
});

var Chat = Backbone.Collection.extend({
	model: ChatMessage,
});

var ChatMessageView = Backbone.View.extend({
	tagName: 'p',

	initialize: function () {
		this.model.on('remove', this.remove, this);
	},

	render: function () {
		var attrs = this.model.attributes, $p = this.$el;
		if (_.isArray(attrs.text))
			renderTokenized($p.empty(), attrs.text);
		else
			$p.text(attrs.text);
		if (attrs.name)
			$p.prepend($('<b/>', {text: '<' + attrs.name + '>'}), ' ');
		if (attrs.kind)
			$p.addClass(attrs.kind);
		return this;
	},
});

var ChatView = Backbone.View.extend({
	id: 'chat',

	events: {
		submit: 'sendChat',
	},

	initialize: function () {
		var $messages = $('<div id=messages/>');
		this.$countdown = $('<p id="countdown"/>').hide().appendTo($messages);
		var $input = $('<input>', {maxlength: MESSAGE_LENGTH});
		var $form = $('<form/>').append($input);
		this.$el.append($messages, $form);
		setTimeout(function () {
			$input.focus();
		}, 0);

		this.model.on('add', this.addMessage, this);
		this.model.on('reset', this.reset, this);

		// bleh
		game.on('change:countdown', this.renderCountdown, this);
	},

	reset: function () {
		this.$countdown.detach();
		var $box = this.$('#messages').empty();
		for (var i = 0; i < this.model.length; i++) {
			var view = new ChatMessageView({model: this.model.at(i)});
			$box.append(view.render().el);
		}
		$box.append(this.$countdown);
		this.scrollToBottom();
	},

	addMessage: function (message) {
		var view = new ChatMessageView({model: message});
		var $msg = view.render().$el;
		$msg.hide().fadeIn('fast').insertBefore(this.$countdown);
		this.trim();
		this.scrollToBottom();
	},

	scrollToBottom: function () {
		var $box = this.$('#messages');
		$box.scrollTop($box[0].scrollHeight);
	},

	trim: function () {
		var over = this.model.length - CHAT_HISTORY;
		if (over > 0)
			this.model.remove(this.model.first(over));
	},

	sendChat: function (event) {
		event.preventDefault();
		var $input = this.$('form input');
		var text = $input.val().trim();
		if (!text)
			return;
		send('chat', {text: text});
		$input.val('').focus();
	},

	renderCountdown: function (model, n, info) {
		var prev = model._previousAttributes.countdown;
		prev = (prev && prev < 11);
		if (n && n < 11) {
			this.$countdown.text('Ending in ' + n + '...');
			if (!prev) {
				this.$countdown.show();
				this.scrollToBottom();
			}
		}
		else if (prev)
			this.$countdown.hide();
	},
});

window.account = new Account;
window.chat = new Chat;
window.hand = new Cards;
window.game = new Game;

function send(type, msg) {
	msg.a = type;
	msg = JSON.stringify(msg);
	sock.send(msg);
}

window.sock = new SockJS(SOCKJS_URL);
sock.onopen = function () {
	var id = localStorage.getItem('camId');
	if (!id) {
		id = randomId();
		localStorage.setItem('camId', id);
	}
	send('login', {id: id});
};

sock.onmessage = function (msg) {
	_.each(JSON.parse(msg.data), function (data) {
		dispatch[data.a].call(data);
	});
};

sock.onclose = function () {
	var err = 'Lost connection.';
	if (game.get('error'))
		err = 'Dropped: ' + game.get('status');
	game.set({status: err, error: true});
};

var dispatch = {
	set: function () {
		var target = 'game';
		if (this.t) {
			target = this.t;
			delete this.t;
		}
		window[target].set(this);
	},

	add: function () {
		window[this.t].add(this.objs || this.obj);
	},

	reset: function () {
		window[this.t].reset(this.objs);
	},

	select: function () {
		var targets = _.map(this.cards, function (card) {
			return hand.get(card);
		});
		var final = this.final;
		hand.each(function (card) {
			var dest = 'normal';
			if (targets.indexOf(card) >= 0) {
				if (final)
					return;
				dest = 'selected';
			}
			else if (!final && card.get('state') == 'selecting')
				return;
			card.set({state: dest});
		});
		if (final)
			hand.remove(targets);
		game.set({selectionConfirmed: this.cards.length && !final});
	},

	elect: function () {
		var winner = this.cards;
		_.each(game.get('submissions'), function (sub) {
			if (!sub.el)
				return;
			if (_.isEqual(sub.cards, winner))
				$(sub.el).addClass('winner');
			else
				$(sub.el).animate({opacity: 0});
		});
	},

	countdown: function () {
		if (countdownInterval) {
			clearInterval(countdownInterval);
			countdownInterval = 0;
		}
		if (this.remaining)
			countdownInterval = setInterval(countdown, 1000);
		game.set('countdown', this.remaining);
	},
};

var countdownInterval = 0;

function countdown() {
	var n = game.get('countdown');
	if (n && n >= 1)
		game.set('countdown', n-1);
	else if (countdownInterval) {
		clearInterval(countdownInterval);
		countdownInterval = 0;
	}
}

var blinkInterval = 0;
var normalTitle = document.title;

function onFocus() {
	document.title = normalTitle;
	if (blinkInterval)
		clearInterval(blinkInterval);
	blinkInterval = 0;
	game.off('change:action change:selectionConfirmed', actionChangeWhileBlurred);
}

function onBlur() {
	game.on('change:action change:selectionConfirmed', actionChangeWhileBlurred);
	actionChangeWhileBlurred();
}

function actionChangeWhileBlurred() {
	var actionNeeded = game.get('action');
	if (actionNeeded == 'nominate')
		actionNeeded = !game.get('selectionConfirmed');
	if (!actionNeeded) {
		if (blinkInterval)
			clearInterval(blinkInterval);
		blinkInterval = 0;
		document.title = normalTitle;
	}
	else if (!blinkInterval) {
		blinkTitle();
		blinkInterval = setInterval(blinkTitle, 1000);
	}
}

function blinkTitle() {
	if (document.title.match(/^\(!\)/))
		document.title = '( ) ' + normalTitle;
	else
		document.title = '(!) ' + normalTitle;
}

function suggestionBox() {
	var $label = $('<label for=suggestion>Suggest a card:</label>');
	var $sug = $('<input id=suggestion maxlength=200>');
	var $thanks = $('<span>Thanks!</span>').css({opacity: 0});
	var $box = $('<form id=suggestions/>').append($label, ' ', $sug, '<br>', $thanks);
	$box.on('submit', function (event) {
		event.preventDefault();
		var card = $sug.val().trim();
		if (card) {
			send('suggest', {card: card});
			$thanks.css({opacity: 1});
			setTimeout(function () {
				$thanks.animate({opacity: 0});
			}, 500);
		}
		$sug.val('').focus();
	});
	return $box;
}

$(function () {
	var $game = $('#game');
	new AccountView({model: account}).render().$el.insertBefore($game);
	suggestionBox().insertAfter($game);
	var gameView = new GameView({model: game, el: $game[0]});
	window.addEventListener('focus', onFocus, false);
	window.addEventListener('blur', onBlur, false);
});

})();
