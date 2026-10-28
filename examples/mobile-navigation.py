# Mobile navigation: NavigationBar and Stack, the way a phone app moves between
# pages.
#
#   NavigationBar  the bar at the top of a page: a title in the middle, a back
#                  button on the left and an action button on the right. A button
#                  shows only while it has text; on_back and on_action are called
#                  with the bar when it is tapped.
#   Stack          pages on top of each other, one showing: select(i)
#
# Mailboxes -> the messages in one -> a message, with Back at each step, and
# Compose from the first two pages (Cancel and Send there). Every page change
# goes through go(), which sets what the bar says: that is the whole trick.
# Made for a phone-sized window, about 360 by 640.

mail = {
    "Inbox": [["Welcome", "Hello, and welcome to FastBlips!"], ["Lunch?", "Are you free at noon?"]],
    "Starred": [["Lunch?", "Are you free at noon?"]],
    "Sent": [],
}
MAILBOXES, MESSAGES, READER, COMPOSE = 0, 1, 2, 3
here = {"page": 0, "box": "", "message": 0, "from": 0}

phone = Composite()
phone.fill()
phone.set_layout("vbox")

bar = NavigationBar("Mailboxes")
bar.set_id("bar")
phone.add(bar)

stack = Stack()
stack.set_id("stack")
stack.set_flex(1)
phone.add(stack)

status = Label("")
status.set_id("status")
status.set_height(26)
phone.add(status)

# page 0: the mailboxes
boxes = ListPanel()
boxes.set_id("boxes")
for name in ["Inbox", "Starred", "Sent"]:
    boxes.add_item(name)
stack.add(boxes)

# page 1: the messages in the mailbox
messages = ListPanel()
messages.set_id("messages")
messages.set_empty_text("(no messages)")
stack.add(messages)

# page 2: one message
reader = VPanel()
reader.set_padding(10)
reader.set_spacing(6)
subject_label = Label("")
subject_label.set_id("subject-label")
subject_label.set_height(26)
body_text = TextArea("")
body_text.set_id("body-text")
body_text.set_read_only(True)
body_text.set_flex(1)
reader.add(subject_label)
reader.add(body_text)
stack.add(reader)

# page 3: a new message
compose = VPanel()
compose.set_padding(10)
compose.set_spacing(6)
to_field = TextField("")
to_field.set_id("to")
to_field.set_placeholder("To")
subject_field = TextField("")
subject_field.set_id("subject")
subject_field.set_placeholder("Subject")
body_field = TextArea("")
body_field.set_id("body")
body_field.set_placeholder("Message")
body_field.set_flex(1)
compose.add(to_field)
compose.add(subject_field)
compose.add(body_field)
stack.add(compose)


# Shows a page and sets the bar to match it.
def go(page):
    here["page"] = page
    stack.select(page)
    if page == MAILBOXES:
        bar.set_title("Mailboxes")
        bar.set_back_text("")
        bar.set_action_text("Compose")
    elif page == MESSAGES:
        bar.set_title(here["box"])
        bar.set_back_text("Mailboxes")
        bar.set_action_text("Compose")
    elif page == READER:
        bar.set_title(mail[here["box"]][here["message"]][0])
        bar.set_back_text(here["box"])
        bar.set_action_text("")
    else:
        bar.set_title("New message")
        bar.set_back_text("Cancel")
        bar.set_action_text("Send")


def box_picked(widget, index):
    if index < 0:
        return
    here["box"] = widget.get_item(index)
    messages.clear()
    for message in mail[here["box"]]:
        messages.add_item(message[0])
    widget.select(-1)
    go(MESSAGES)


def message_picked(widget, index):
    if index < 0:
        return
    here["message"] = index
    subject_label.set_text(mail[here["box"]][index][0])
    body_text.set_text(mail[here["box"]][index][1])
    widget.select(-1)
    go(READER)


def back():
    if here["page"] == READER:
        go(MESSAGES)
    elif here["page"] == MESSAGES:
        go(MAILBOXES)
    elif here["page"] == COMPOSE:
        status.set_text("Cancelled")
        go(here["from"])


def action():
    if here["page"] == COMPOSE:
        if subject_field.get_text().strip() == "":
            status.set_text("Add a subject first")
            return
        mail["Sent"].append([subject_field.get_text().strip(), body_field.get_text()])
        subject_field.set_text("")
        body_field.set_text("")
        to_field.set_text("")
        status.set_text("Message sent")
        go(here["from"])
    else:
        here["from"] = here["page"]
        status.set_text("")
        go(COMPOSE)


boxes.on_select(box_picked)
messages.on_select(message_picked)
bar.on_back(back)
bar.on_action(action)
go(MAILBOXES)
