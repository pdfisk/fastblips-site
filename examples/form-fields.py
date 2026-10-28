# A sign-up form: TextField, PasswordField, TextArea, SelectBox, CheckGroupBox,
# RadioGroupBox, Label and Button, laid out with a Composite grid.
#
#   TextField / PasswordField  one line of text; a PasswordField shows dots, and
#                              its text is never saved with a screen
#   TextArea                   several lines
#   SelectBox                  a drop-down: one item is always chosen
#   RadioGroupBox              a titled frame with a radio button: choosing one
#                              unchecks the others in its container
#   CheckGroupBox              a titled frame with a check box: while it is
#                              unchecked, what is inside it cannot be used
#
# The button stays off until the form is valid. Handlers that need nothing from
# the event take no arguments at all. Made for a window of about 460 by 560.

page = Composite()
page.fill()
page.set_layout("vbox")
page.set_padding(8)
page.set_spacing(6)

heading = Label("Create an account")
heading.set_height(24)
page.add(heading)

# --- the fields, in a grid: labels in the first column, fields in the second
form = Composite()
form.set_layout("grid")
form.set_spacing(6)
form.set_column_flex(1, 1)
page.add(form)


def field_row(row, caption, widget):
    label = Label(caption)
    form.add(label)
    label.set_cell(row, 0)
    label.set_align("left", "middle")
    form.add(widget)
    widget.set_cell(row, 1)


name = TextField("")
name.set_id("name")
name.set_placeholder("Your name")
name.set_max_length(20)
field_row(0, "Name", name)

email = TextField("")
email.set_id("email")
email.set_placeholder("you@example.com")
field_row(1, "Email", email)

password = PasswordField()
password.set_id("password")
password.set_placeholder("At least 6 characters")
field_row(2, "Password", password)

again = PasswordField()
again.set_id("again")
again.set_placeholder("Type it again")
field_row(3, "Confirm", again)

country = SelectBox()
country.set_id("country")
for place in ["Canada", "France", "Japan", "Brazil"]:
    country.add_item(place)
field_row(4, "Country", country)

bio = TextArea("")
bio.set_id("bio")
bio.set_placeholder("A line or two about you")
bio.set_height(64)
field_row(5, "About you", bio)

# --- a choice of plan: RadioGroupBoxes in one container are one group
plans = Composite()
plans.set_layout("hbox")
plans.set_spacing(8)
plans.set_height(70)
page.add(plans)

free = RadioGroupBox("Free")
free.set_id("free")
free.set_flex(1)
free.add(Label("One project"))
pro = RadioGroupBox("Pro")
pro.set_id("pro")
pro.set_flex(1)
pro.add(Label("Unlimited projects"))
plans.add(free)
plans.add(pro)
free.set_checked(True)

# --- the newsletter: a CheckGroupBox, whose contents work only while it is checked
news = CheckGroupBox("Send me news")
news.set_id("news")
news.set_height(70)
how = SelectBox()
how.set_id("how")
how.add_item("Weekly")
how.add_item("Monthly")
news.add(how)
page.add(news)

# --- the buttons and what the form says about itself
buttons = HPanel()
buttons.set_spacing(8)
buttons.set_height(32)
page.add(buttons)
create = Button("Create account")
create.set_id("create")
create.set_width(140)
create.set_enabled(False)
clear = Button("Clear form")
clear.set_id("clear")
clear.set_width(100)
buttons.add(create)
buttons.add(clear)
buttons.add(Spacer())

status = Label("Fill in the form")
status.set_id("status")
status.set_height(24)
page.add(status)


# What is wrong with the form, or "" when nothing is.
def problem():
    if name.get_text().strip() == "":
        return "Enter your name"
    if email.get_text().find("@") < 0:
        return "That email needs an @"
    if len(password.get_text()) < 6:
        return "The password needs at least 6 characters"
    if password.get_text() != again.get_text():
        return "The two passwords differ"
    return ""


def refresh():
    why = problem()
    create.set_enabled(why == "")
    if why == "":
        status.set_text("Ready")
    else:
        status.set_text(why)


def create_account():
    if problem() != "":
        return
    text = "Welcome, " + name.get_text().strip() + "!"
    if pro.is_checked():
        text = text + " Plan: Pro."
    else:
        text = text + " Plan: Free."
    if news.is_checked():
        text = text + " News: " + how.get_selected_text().lower() + "."
    status.set_text(text)


def clear_form():
    name.set_text("")
    email.set_text("")
    password.set_text("")
    again.set_text("")
    bio.set_text("")
    country.select(0)
    free.set_checked(True)
    news.set_checked(True)
    how.select(0)
    refresh()
    name.focus()


# Any change to a field checks the form again.
for field in [name, email, password, again]:
    field.on_change(refresh)
again.on_submit(create_account)
create.on_click(create_account)
clear.on_click(clear_form)
name.focus()
